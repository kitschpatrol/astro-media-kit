// The kit's Video.js player, as the components render it, lifted whole into the
// viewer: its own control bar floats over the viewer, the viewer handles
// closing, and its poster stands in for it on the page.

import { afterEach, expect, it } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import { setVideoSource } from '../../src/components/internal/video-source'
import '../../src/components/internal/videojs-ui'
import '../../src/components/internal/videojs-media'
import '@videojs/html/media/vimeo-video'
import '../../src/components/internal/amk-video.css'
import {
	boxes,
	cleanUp,
	clickMiddle,
	currentLayer,
	fadeOf,
	frames,
	isLifted,
	liftDone,
	mount,
	mountPage,
	query,
	settle,
	setUpLightbox,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

/** The fixture page's player, with its media source assigned as it is on load. */
async function mountPlayer(): Promise<{ item: HTMLElement; player: HTMLElement }> {
	const fixture = await mountPage('/zoom/')
	// The media script assigns `data-src` sources on load and after navigation
	document.dispatchEvent(new Event('astro:page-load'))
	const item = boxes(query(fixture, '#video'))[0]!
	const player = query(item, 'video-player')
	await customElements.whenDefined('video-player')
	await expect.poll(() => query(item, 'video').getAttribute('src')).toBe('/media/loop.mp4')
	// The page's images load now rather than as they scroll into view, so that
	// none of them shifts the player partway through a test
	const images = [...fixture.querySelectorAll('img')]
	for (const image of images) {
		image.loading = 'eager'
	}

	await expect
		.poll(() => images.every((image) => !image.checkVisibility() || image.complete))
		.toBe(true)
	// Wait for the media and volume trigger to connect before sending pointer input.
	await expect
		.poll(() => query(player, 'video', HTMLVideoElement).readyState, { timeout: 10_000 })
		.toBeGreaterThan(0)
	await expect
		.poll(() => query(player, 'media-volume-popover').dataset.availability)
		.toBe('available')
	await expect
		.poll(() => query(player, 'amk-mute-button').getAttribute('aria-controls'))
		.toBe(query(player, 'media-volume-popover').id)
	// Leave room above the controls, independent of the previous test's scroll position.
	player.scrollIntoView({ behavior: 'instant', block: 'center' })
	// Start outside the settled player so the next hover delivers a fresh pointer entry.
	await commands.mouseMove(5, 5)
	await expect
		.poll(() => query(player, 'amk-mute-button').getAttribute('aria-expanded'))
		.toBe('false')
	return { item, player }
}

it("leaves a page's own media that waits in data-src alone", async () => {
	const { item } = await mountPlayer()
	const own = document.createElement('video')
	own.dataset.src = '/media/loop.mp4'
	item.after(own)
	document.dispatchEvent(new Event('astro:page-load'))
	await settle(100)
	expect(own.hasAttribute('src')).toBe(false)
})

// WebKit on Linux runners has stalled this file's first video load for over 10s,
// though the same load works in the next test. The cause is unknown.
it('is not a button, and leaves clicks on its controls to the player', { retry: 1 }, async () => {
	const { item, player } = await mountPlayer()
	expect(item.hasAttribute('role')).toBe(false)
	expect(item.hasAttribute('tabindex')).toBe(false)
	expect(item.dataset.zoomInteractive).toBe('')

	await userEvent.click(query(player, 'media-play-button'))

	expect(document.querySelector('dialog.amk-lightbox[open]')).toBeNull()
})

it('lifts the whole player, swaps expand for collapse, and closes from the lightbox button', async () => {
	const { item, player } = await mountPlayer()
	const button = query(player, '[data-zoom-open]')
	const collapse = query(player, '[data-zoom-close]')
	const controls = query(player, '.amk-controls')
	expect(getComputedStyle(button).display).not.toBe('none')
	expect(getComputedStyle(collapse).display).toBe('none')

	await userEvent.click(button)

	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	expect(isLifted(item)).toBe(true)
	expect(currentLayer().contains(player)).toBe(true)
	expect(viewer().contains(controls)).toBe(true)
	expect(controls.getAttribute('popover')).toBe('manual')
	expect(controls.matches(':popover-open')).toBe(true)
	expect(getComputedStyle(button).display).toBe('none')
	expect(getComputedStyle(collapse).display).not.toBe('none')
	const frame = query(viewer(), '.amk-lightbox-frame').getBoundingClientRect()
	expect(frame.width / frame.height).toBeCloseTo(16 / 9, 1)

	await userEvent.click(query(viewer(), '.amk-lightbox-close'))

	await expect.poll(() => viewer().open).toBe(false)
	expect(item.contains(player)).toBe(true)
	expect(controls.hasAttribute('popover')).toBe(false)
	expect(isLifted(item)).toBe(false)
})

it('returns the player to the page from its collapse button', async () => {
	const { item, player } = await mountPlayer()
	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	const collapse = query(player, '[data-zoom-close]')
	expect(collapse.getAttribute('aria-label')).toBe('Collapse video')

	await userEvent.click(collapse)

	await expect.poll(() => viewer().open).toBe(false)
	expect(item.contains(player)).toBe(true)
	expect(isLifted(item)).toBe(false)
	expect(getComputedStyle(collapse).display).toBe('none')
	expect(getComputedStyle(query(player, '[data-zoom-open]')).display).not.toBe('none')
})

it('floats the controls again when a closing player is reopened', async () => {
	const { item, player } = await mountPlayer()
	await openLightbox(item)
	await liftDone()
	const controls = query(player, '.amk-controls')
	expect(controls.matches(':popover-open')).toBe(true)
	const layer = currentLayer()

	// Closing hides the bar at once; a click on the returning player turns the
	// close around, and the bar must float with it
	const closing = closeLightbox()
	expect(viewer().dataset.state).toBe('closing')
	clickMiddle(layer)
	await closing
	await liftDone()

	expect(viewer().open).toBe(true)
	expect(viewer().dataset.state).toBe('open')
	expect(player.dataset.controls).toBe('full')
	await expect.poll(() => controls.matches(':popover-open')).toBe(true)

	await closeLightbox()
	expect(item.contains(player)).toBe(true)
	expect(player.dataset.controls).toBe('full')
	expect(controls.hasAttribute('popover')).toBe(false)
})

it.each(['pointer', 'Enter', 'Space'] as const)(
	'restores video expand focus only for keyboard activation, opened with %s',
	async (activation) => {
		const { player } = await mountPlayer()
		const button = query(player, '[data-zoom-open]')
		if (activation === 'pointer') {
			await userEvent.click(button)
		} else {
			await userEvent.keyboard('{Tab}')
			button.focus()
			await userEvent.keyboard(activation === 'Enter' ? '{Enter}' : ' ')
		}

		await expect.poll(() => viewer().dataset.state).toBe('open')
		await liftDone()
		await commands.mouseMove(5, 5)
		await userEvent.keyboard('{Escape}')
		await expect.poll(() => viewer().open).toBe(false)
		const keyboard = activation !== 'pointer'
		expect(document.activeElement === button).toBe(keyboard)
		expect(button.matches(':focus-visible')).toBe(keyboard)
		// Tooltip reopening on restored keyboard focus varies across engines;
		// it must never linger without an active trigger.
		await expect
			.poll(
				() =>
					query(player, '.amk-zoom-tooltip').matches(':popover-open') &&
					!button.matches(':focus-visible'),
			)
			.toBe(false)
	},
)

it('keeps zoom cursors off the video toolbar in both zoom states', async () => {
	const { item, player } = await mountPlayer()
	item.dataset.level = 'fill'
	await openLightbox(item)
	await liftDone()
	for (const cursor of ['zoom-in', 'zoom-out']) {
		if (cursor === 'zoom-out') {
			await userEvent.click(query(viewer(), '.amk-lightbox-zoom'))
		}

		expect(getComputedStyle(currentLayer()).cursor).toBe(cursor)
		for (const selector of [
			'.amk-controls',
			'.amk-bar',
			'.amk-time',
			'media-time',
			'media-time-separator',
		]) {
			expect(getComputedStyle(query(player, selector)).cursor).toBe('default')
		}

		for (const selector of ['.amk-bar media-play-button', 'amk-mute-button', 'media-time-slider']) {
			expect(getComputedStyle(query(player, selector)).cursor).toBe('pointer')
		}
	}
})

it('stands its poster in for the player while it is lifted', async () => {
	const { item } = await mountPlayer()
	await expect.poll(() => item.querySelector('media-poster[data-visible]')).not.toBeNull()
	const container = query(item, 'media-container').getBoundingClientRect()

	await userEvent.click(query(item, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')

	const preview = query(item, '[data-amk-preview]', HTMLImageElement)
	expect(preview.src).toContain('/media/loop-poster.jpg')
	expect(preview.inert).toBe(true)
	const box = preview.getBoundingClientRect()
	expect(box.width).toBeCloseTo(container.width, 0)
	expect(box.height).toBeCloseTo(container.height, 0)
	expect(box.x).toBeCloseTo(container.x, 0)
})

it('keeps the floated controls visible while they are used, and hides them when idle', async () => {
	const { player } = await mountPlayer()
	await query(player, 'video', HTMLVideoElement).play()
	await userEvent.hover(query(player, 'media-container'))
	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	const controls = query(player, '.amk-controls')
	expect(Object.hasOwn(controls.dataset, 'userInactive')).toBe(false)

	query(controls, 'media-play-button').focus()
	await new Promise((resolve) => {
		setTimeout(resolve, 2300)
	})
	expect(Object.hasOwn(controls.dataset, 'userInactive')).toBe(false)
	expect(viewer().querySelector('.amk-controls-background')).toBeNull()

	viewer().focus()
	await expect
		.poll(() => Object.hasOwn(controls.dataset, 'userInactive'), { timeout: 4000 })
		.toBe(true)
	await expect.poll(() => getComputedStyle(controls).opacity).toBe('0')
	query(controls, 'media-play-button').focus()
	await expect.poll(() => getComputedStyle(controls).opacity).toBe('1')
})

it('slides its control bar up as it lifts, and away again as it lands', async () => {
	const { player } = await mountPlayer()
	const controls = query(player, '.amk-controls')
	const button = query(player, '[data-zoom-open]')
	// Slow enough to look in on the bar while it moves
	const slow = document.createElement('style')
	slow.textContent = '.amk-lightbox { --amk-lightbox-duration: 1s }'
	document.head.append(slow)
	try {
		await userEvent.click(button)
		await expect.poll(() => controls.matches(':popover-open')).toBe(true)
		const entering = controls
			.getAnimations()
			.filter((animation) => animation instanceof CSSTransition)
			.map((animation) => animation.transitionProperty)
		expect(entering).toContain('translate')
		const rising = controls.getBoundingClientRect().top
		await liftDone(3000)
		await expect
			.poll(() => controls.getBoundingClientRect().bottom)
			.toBeCloseTo(window.innerHeight, 0)
		expect(rising).toBeGreaterThan(controls.getBoundingClientRect().top)

		viewer().requestClose()
		await expect.poll(() => controls.matches(':popover-open')).toBe(false)
		// Still a popover, on its way out, while the player zooms home
		expect(controls.hasAttribute('popover')).toBe(true)
		await expect.poll(() => viewer().open, { timeout: 3000 }).toBe(false)
		expect(controls.hasAttribute('popover')).toBe(false)
	} finally {
		slow.remove()
	}
})

it('crossfades video control strips in place, including a rapid reversal', async () => {
	const { item, player } = await mountPlayer()
	const otherItem = query(document, '#video-minimal .amk-zoom')
	const otherPlayer = query(otherItem, 'video-player')
	item.dataset.gallery = 'strips'
	otherItem.dataset.gallery = 'strips'
	otherPlayer.dataset.controls = 'full'
	const otherVideo = query(otherPlayer, 'video', HTMLVideoElement)
	await expect.poll(() => otherVideo.readyState).toBeGreaterThan(0)
	otherVideo.currentTime = 2
	await expect
		.poll(() => query(otherPlayer, 'media-time[type="current"]').textContent)
		.toContain('0:02')
	mount(`<style>.amk {
		--amk-duration: 800ms;
		--amk-control-background: rgb(40 40 40 / 60%);
		--amk-control-size: 56px;
	}</style>`)
	await openLightbox(item)
	const first = query(player, '.amk-controls')
	const second = query(otherPlayer, '.amk-controls')
	await expect.poll(() => getComputedStyle(first).opacity).toBe('1')
	expect(viewer().querySelector('.amk-controls-background')).toBeNull()
	await userEvent.click(query(viewer(), '.amk-lightbox-next'))
	await expect.poll(() => second.matches(':popover-open')).toBe(true)
	const background = query(viewer(), '.amk-controls-background')
	await expect.poll(() => getComputedStyle(background).opacity).toBe('1')
	expect(background.inert).toBe(true)
	expect(background.ariaHidden).toBe('true')
	expect(getComputedStyle(background).backgroundColor).toBe('rgba(40, 40, 40, 0.6)')
	expect(background.getBoundingClientRect().height).toBe(56)
	expect(first.matches(':popover-open')).toBe(true)
	expect(getComputedStyle(query(first, '.amk-bar')).pointerEvents).toBe('none')
	expect(query(viewer(), '.amk-controls-background')).toBe(background)
	expect(getComputedStyle(background).opacity).toBe('1')
	expect(background.getAnimations()).toHaveLength(0)
	for (const controls of [first, second]) {
		expect(getComputedStyle(query(controls, '.amk-bar')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
		expect(controls.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0)
		const properties = controls
			.getAnimations({ subtree: true })
			.filter((animation) => animation instanceof CSSTransition)
			.map((animation) => animation.transitionProperty)
		expect(properties).toContain('opacity')
		expect(properties).not.toContain('translate')
	}

	await userEvent.click(query(viewer(), '.amk-lightbox-previous'))
	await expect.poll(() => Object.hasOwn(first.dataset, 'crossfadeOut')).toBe(false)
	expect(Object.hasOwn(second.dataset, 'crossfadeOut')).toBe(true)
	expect(query(viewer(), '.amk-controls-background')).toBe(background)
	expect(getComputedStyle(background).opacity).toBe('1')
	expect(background.getAnimations()).toHaveLength(0)
	for (const controls of [first, second]) {
		expect(controls.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0)
		expect(
			controls
				.getAnimations({ subtree: true })
				.filter((animation) => animation instanceof CSSTransition)
				.map((animation) => animation.transitionProperty),
		).not.toContain('translate')
	}

	await closeLightbox()
	expect(Object.hasOwn(first.dataset, 'crossfade')).toBe(false)
	expect(Object.hasOwn(second.dataset, 'crossfade')).toBe(false)
	expect(viewer().querySelector('.amk-controls-background')).toBeNull()
	expect(getComputedStyle(query(first, '.amk-bar')).backgroundColor).toBe('rgba(40, 40, 40, 0.6)')
})

it('restores ordinary bar painting after a crossfade and leaves stationary controls untouched', async () => {
	const { item } = await mountPlayer()
	const other = query(document, '#video-minimal .amk-zoom')
	item.dataset.gallery = 'settled-background'
	other.dataset.gallery = 'settled-background'
	const controls = query(other, '.amk-controls')
	const strip = query(controls, '.amk-bar')
	strip.style.background = 'rgb(80 80 80 / 40%)'
	strip.style.transition = 'background 1s'
	await openLightbox(item)
	await userEvent.click(query(viewer(), '.amk-lightbox-next'))
	await expect.poll(() => controls.matches(':popover-open')).toBe(true)
	await expect.poll(() => viewer().querySelector('.amk-controls-background')).toBeNull()
	expect(getComputedStyle(strip).backgroundColor).toBe('rgba(80, 80, 80, 0.4)')
	expect(getComputedStyle(controls).opacity).toBe('1')
	expect(strip.getAnimations()).toHaveLength(0)
	let mutations = 0
	const observer = new MutationObserver((records) => {
		mutations += records.length
	})
	observer.observe(strip, {
		attributeFilter: ['style', 'data-floated-background'],
		attributes: true,
	})
	await new Promise((resolve) => {
		setTimeout(resolve, 300)
	})
	observer.disconnect()
	expect(mutations).toBe(0)
})

it.each([1, 0.4])(
	'keeps unchanged buttons at opacity %s while playback positions crossfade',
	async (opacity) => {
		const { item, player } = await mountPlayer()
		const other = query(document, '#video-minimal .amk-zoom')
		item.dataset.gallery = 'steady-buttons'
		other.dataset.gallery = 'steady-buttons'
		const video = query(other, 'video', HTMLVideoElement)
		await expect.poll(() => video.readyState).toBeGreaterThan(0)
		video.currentTime = 2
		await expect
			.poll(() => query(other, 'media-time[type="current"]').textContent)
			.toContain('0:02')
		mount('<style>.amk { --amk-duration: 800ms }</style>')
		const first = query(player, '.amk-controls')
		const second = query(other, '.amk-controls')
		for (const controls of [first, second]) {
			for (const button of controls.querySelectorAll<HTMLElement>(':scope .amk-bar .amk-button')) {
				button.style.opacity = String(opacity)
			}
		}

		await openLightbox(item)
		await expect.poll(() => getComputedStyle(first).opacity).toBe('1')
		await userEvent.click(query(viewer(), '.amk-lightbox-next'))
		await expect.poll(() => second.matches(':popover-open')).toBe(true)
		const fades = [first, second]
			.flatMap((controls) => controls.getAnimations({ subtree: true }))
			.filter(
				(animation) =>
					animation instanceof CSSTransition && animation.transitionProperty === 'opacity',
			)
		expect(fades.length).toBeGreaterThan(0)
		for (const fade of fades) {
			fade.pause()
		}

		for (const progress of [0.25, 0.5, 0.75]) {
			for (const fade of fades) {
				fade.currentTime = Number(fade.effect!.getTiming().duration) * progress
			}

			await frames()
			for (const selector of ['.amk-bar media-play-button', 'amk-mute-button']) {
				expect(getComputedStyle(query(second, selector)).opacity).toBe(String(opacity))
				expect(getComputedStyle(query(first, selector)).opacity).toBe('0')
			}

			expect(getComputedStyle(second).opacity).toBe('1')
			expect(getComputedStyle(query(viewer(), '.amk-controls-background')).opacity).toBe('1')
		}

		for (const fade of fades) {
			fade.finish()
		}

		await expect.poll(() => first.matches(':popover-open')).toBe(false)
		await expect.poll(() => viewer().querySelector('.amk-controls-background')).toBeNull()
		expect(getComputedStyle(query(second, '.amk-bar media-play-button')).opacity).toBe(
			String(opacity),
		)
		await userEvent.click(query(second, '.amk-bar media-play-button'))
		await expect.poll(() => video.paused).toBe(false)
		expect(query(player, 'video', HTMLVideoElement).paused).toBe(true)
	},
)

it('uses overlay opacity during swaps and restores page-only styling on return', async () => {
	const { item, player } = await mountPlayer()
	const other = query(document, '#video-minimal .amk-zoom')
	item.dataset.gallery = 'scoped-opacity'
	other.dataset.gallery = 'scoped-opacity'
	mount(`<style>
		.amk { --amk-duration: 800ms }
		.amk-controls:not([popover]) .amk-bar .amk-button { opacity: .4 }
	</style>`)
	const first = query(player, '.amk-controls')
	const second = query(other, '.amk-controls')
	await openLightbox(item)
	await expect.poll(() => getComputedStyle(first).opacity).toBe('1')
	await userEvent.click(query(viewer(), '.amk-lightbox-next'))
	await expect.poll(() => second.matches(':popover-open')).toBe(true)
	expect(getComputedStyle(query(second, '.amk-bar media-play-button')).opacity).toBe('1')
	await closeLightbox()
	for (const controls of [first, second]) {
		expect(getComputedStyle(query(controls, '.amk-bar media-play-button')).opacity).toBe('0.4')
	}
})

it.each(['color', 'size', 'playback', 'opacity'])(
	'fades buttons whose %s differs instead of treating their icons as unchanged',
	async (difference) => {
		const { item, player } = await mountPlayer()
		const other = query(document, '#video-minimal .amk-zoom')
		item.dataset.gallery = 'different-buttons'
		other.dataset.gallery = 'different-buttons'
		if (difference === 'color' || difference === 'size') {
			query(other, '.amk').style.setProperty(
				difference === 'color' ? '--amk-control-color' : '--amk-control-size',
				difference === 'color' ? '#aaa' : '60px',
			)
		} else if (difference === 'playback') {
			await query(other, 'video', HTMLVideoElement).play()
		} else {
			query(other, '.amk-bar media-play-button').style.opacity = '0.4'
		}

		await expect
			.poll(() => query(other, '.amk-bar media-play-button').getAttribute('aria-label'))
			.toBe(difference === 'playback' ? 'Pause' : 'Play')
		mount('<style>.amk { --amk-duration: 800ms }</style>')
		const first = query(player, '.amk-controls')
		const second = query(other, '.amk-controls')
		await openLightbox(item)
		await expect.poll(() => getComputedStyle(first).opacity).toBe('1')
		await userEvent.click(query(viewer(), '.amk-lightbox-next'))
		await expect.poll(() => second.matches(':popover-open')).toBe(true)
		const fades = [first, second].map((controls) =>
			fadeOf(query(controls, '.amk-bar media-play-button')),
		)
		for (const fade of fades) {
			expect(fade).toBeDefined()
			fade!.pause()
			fade!.currentTime = 400
		}

		await frames()
		for (const controls of [first, second]) {
			expect(
				Number(getComputedStyle(query(controls, '.amk-bar media-play-button')).opacity),
			).toBeGreaterThan(0)
			expect(
				Number(getComputedStyle(query(controls, '.amk-bar media-play-button')).opacity),
			).toBeLessThan(difference === 'opacity' && controls === second ? 0.4 : 1)
		}

		for (const fade of fades) {
			fade!.finish()
		}
	},
)

it('retains the shared background until a returning idle video finishes its longer fade', async () => {
	const { item, player } = await mountPlayer()
	const other = query(document, '#video-minimal .amk-zoom')
	item.dataset.gallery = 'idle-background'
	other.dataset.gallery = 'idle-background'
	const first = query(player, '.amk-controls')
	const second = query(other, '.amk-controls')
	first.style.setProperty('--amk-duration', '100ms')
	second.style.setProperty('--amk-duration', '1s')
	await query(other, 'video', HTMLVideoElement).play()
	await openLightbox(item)
	await expect.poll(() => getComputedStyle(first).opacity).toBe('1')
	second.dataset.userInactive = ''
	await userEvent.click(query(viewer(), '.amk-lightbox-next'))
	await expect.poll(() => first.matches(':popover-open')).toBe(false)
	expect(second.matches(':popover-open')).toBe(true)
	expect(
		Number(getComputedStyle(query(second, '.amk-bar media-play-button')).opacity),
	).toBeLessThan(1)
	expect(getComputedStyle(query(viewer(), '.amk-controls-background')).opacity).toBe('1')
	await expect.poll(() => viewer().querySelector('.amk-controls-background')).toBeNull()
	expect(getComputedStyle(second).opacity).toBe('1')
})

it(
	'lets idle hiding replace a long crossfade before restoring the bar background',
	{ timeout: 10_000 },
	async () => {
		const { item, player } = await mountPlayer()
		const other = query(document, '#video-minimal .amk-zoom')
		item.dataset.gallery = 'long-background'
		other.dataset.gallery = 'long-background'
		const first = query(player, '.amk-controls')
		const second = query(other, '.amk-controls')
		first.style.setProperty('--amk-duration', '100ms')
		second.style.setProperty('--amk-duration', '2s')
		await query(other, 'video', HTMLVideoElement).play()
		await openLightbox(item)
		await expect.poll(() => getComputedStyle(first).opacity).toBe('1')
		await userEvent.click(query(viewer(), '.amk-lightbox-next'))
		await expect.poll(() => viewer().querySelector('.amk-controls-background')).not.toBeNull()
		const background = query(viewer(), '.amk-controls-background')
		await expect.poll(() => Object.hasOwn(second.dataset, 'userInactive')).toBe(true)
		expect(background.isConnected).toBe(true)
		expect(Number(getComputedStyle(second).opacity)).toBeGreaterThan(0)
		await expect.poll(() => background.isConnected).toBe(false)
		expect(getComputedStyle(second).opacity).toBe('0')
		expect(getComputedStyle(query(second, '.amk-bar')).backgroundColor).toBe(
			'rgba(20, 20, 20, 0.7)',
		)
	},
)

it.each([
	['#first .amk-zoom', 'Home', 'next'],
	['#video-zoom-only .amk-zoom', 'End', 'previous'],
])(
	'hides the shared background for %s and restores it once on return',
	async (selector, away, back) => {
		const { item } = await mountPlayer()
		const other = query(document, selector)
		const second = query(document, '#video-minimal .amk-zoom')
		item.dataset.gallery = 'background'
		other.dataset.gallery = 'background'
		second.dataset.gallery = 'background'
		query(second, '.amk').style.setProperty('--amk-control-color', '#ddd')
		delete other.dataset.scope
		await openLightbox(item)
		await userEvent.click(query(viewer(), '.amk-lightbox-next'))
		await expect.poll(() => viewer().querySelector('.amk-controls-background')).not.toBeNull()
		const background = query(viewer(), '.amk-controls-background')
		await userEvent.keyboard(`{${away}}`)
		await expect
			.poll(() => !background.isConnected || getComputedStyle(background).opacity === '0')
			.toBe(true)
		await expect.poll(() => viewer().querySelector('.amk-controls-background')).toBeNull()
		await userEvent.click(query(viewer(), `.amk-lightbox-${back}`))
		await expect.poll(() => viewer().querySelector('.amk-controls-background')).toBeNull()
		await closeLightbox()
		expect(viewer().querySelector('.amk-controls-background')).toBeNull()
	},
)

it('switches video control strips without motion when reduced motion is requested', async () => {
	const { item, player } = await mountPlayer()
	const otherItem = query(document, '#video-minimal .amk-zoom')
	item.dataset.gallery = 'reduced-strips'
	otherItem.dataset.gallery = 'reduced-strips'
	const first = query(player, '.amk-controls')
	const second = query(otherItem, '.amk-controls')
	await commands.emulateReducedMotion(true)
	try {
		await openLightbox(item)
		await expect.poll(() => getComputedStyle(first).opacity).toBe('1')
		await userEvent.click(query(viewer(), '.amk-lightbox-next'))
		await expect.poll(() => second.matches(':popover-open')).toBe(true)
		expect(getComputedStyle(second).opacity).toBe('1')
		expect(second.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0)
		expect(first.getAnimations()).toHaveLength(0)
		expect(second.getAnimations()).toHaveLength(0)
		expect(viewer().querySelector('.amk-controls-background')).toBeNull()
	} finally {
		await commands.emulateReducedMotion(false)
	}
})

it('raises a minimal player to the full bar while lifted, and lowers it again after', async () => {
	const fixture = await mountPage('/zoom/')
	document.dispatchEvent(new Event('astro:page-load'))
	const player = query(fixture, '#video-minimal video-player')
	await customElements.whenDefined('video-player')
	const playback = query(player, '.amk-playback')
	const centerPlay = query(player, '.amk-center-play')
	expect(getComputedStyle(playback).display).toBe('none')
	expect(getComputedStyle(centerPlay).display).not.toBe('none')
	await userEvent.hover(query(player, 'media-container'))

	await userEvent.click(query(player, '[data-zoom-open]'))

	await expect.poll(() => viewer().dataset.state).toBe('open')
	expect(player.dataset.controls).toBe('lightbox')
	expect(getComputedStyle(playback).display).toBe('contents')
	expect(getComputedStyle(query(playback, 'media-play-button')).display).not.toBe('none')
	expect(getComputedStyle(centerPlay).display).toBe('none')
	await liftDone()

	await userEvent.click(query(viewer(), '.amk-lightbox-close'))

	await expect.poll(() => viewer().open).toBe(false)
	expect(player.dataset.controls).toBe('minimal')
	expect(getComputedStyle(playback).display).toBe('none')
	expect(getComputedStyle(centerPlay).display).not.toBe('none')
})

it.each([false, true])(
	'fades video button hover highlights out smoothly, lifted=%s',
	async (lifted) => {
		const { item, player } = await mountPlayer()
		if (lifted) {
			await openLightbox(item)
			await liftDone()
		}

		const button = query(player, '.amk-bar media-play-button')
		await userEvent.hover(button)
		expect(getComputedStyle(button).transitionDuration).toBe('0s')
		expect(getComputedStyle(button).backgroundColor).toBe('rgba(50, 50, 50, 0.7)')
		await commands.mouseMove(5, 5)
		// The pointer's leave reaches the page a moment after the move resolves
		const fade = () =>
			button
				.getAnimations()
				.find(
					(animation): animation is CSSTransition =>
						animation instanceof CSSTransition &&
						animation.transitionProperty === 'background-color',
				)
		await expect.poll(fade).toBeDefined()
		const transition = fade()!
		expect(transition.effect!.getTiming().duration).toBe(500)
		expect(transition.effect!.getTiming().easing).toBe('cubic-bezier(0.2, 0.8, 0.1, 1)')
		await expect.poll(() => getComputedStyle(button).backgroundColor).toBe('rgba(0, 0, 0, 0)')

		// Theme overrides inherit through the player even when its bar is floated.
		const video = player.closest<HTMLElement>('.amk-video')!
		video.style.setProperty('--amk-control-transition-duration', '0.8s')
		video.style.setProperty('--amk-control-active-transition-duration', '0.1s')
		expect(getComputedStyle(button).transitionDuration).toBe('0.8s')
		await userEvent.hover(button)
		expect(getComputedStyle(button).transitionDuration).toBe('0.1s')
		await commands.emulateReducedMotion(true)
		try {
			expect(getComputedStyle(button).transitionDuration).toBe('0s')
			await commands.mouseMove(5, 5)
			expect(getComputedStyle(button).transitionDuration).toBe('0s')
			expect(getComputedStyle(button).backgroundColor).toBe('rgba(0, 0, 0, 0)')
		} finally {
			await commands.emulateReducedMotion(false)
		}
	},
)

it('stands the volume slider up in a popover over the mute button, on hover', async () => {
	const { player } = await mountPlayer()
	const popover = query(player, 'media-volume-popover')
	const mute = query(player, 'amk-mute-button')
	expect(Object.hasOwn(popover.dataset, 'open')).toBe(false)

	await userEvent.hover(mute)

	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(true)
	const slider = query(popover, 'media-volume-slider').getBoundingClientRect()
	expect(slider.height).toBeGreaterThan(slider.width)
	const button = mute.getBoundingClientRect()
	await expect.poll(() => popover.getBoundingClientRect().bottom).toBeCloseTo(button.top, 0)
	expect(Math.abs(slider.x + slider.width / 2 - (button.x + button.width / 2))).toBeLessThan(2)

	await commands.mouseMove(5, 5)

	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(false)
})

it.each([false, true])(
	'shrinks the volume track smoothly after hover, lifted=%s',
	async (lifted) => {
		const { item, player } = await mountPlayer()
		if (lifted) {
			await openLightbox(item)
			await liftDone()
		}

		const mute = query(player, 'amk-mute-button')
		const popover = query(player, 'media-volume-popover')
		const slider = query(popover, 'media-volume-slider')
		const track = query(slider, 'media-slider-track')
		await userEvent.hover(mute)
		await expect.poll(() => getComputedStyle(popover).opacity).toBe('1')
		const box = slider.getBoundingClientRect()
		await commands.mouseMove(box.x + box.width / 2, box.y + box.height / 2)
		await expect.poll(() => getComputedStyle(track).width).toBe('6px')
		// Keep the popup open while leaving the slider so its shrinking track stays visible.
		await userEvent.hover(mute)
		const transition = track
			.getAnimations()
			.find(
				(animation) =>
					animation instanceof CSSTransition && animation.transitionProperty === 'width',
			)
		expect(transition).toBeDefined()
		expect(transition!.effect!.getTiming().duration).toBe(150)
		await expect.poll(() => getComputedStyle(track).width).toBe('4px')
		expect(popover.matches(':popover-open')).toBe(true)

		await commands.emulateReducedMotion(true)
		try {
			await commands.mouseMove(box.x + box.width / 2, box.y + box.height / 2)
			await expect.poll(() => getComputedStyle(track).width).toBe('6px')
			await userEvent.hover(mute)
			expect(getComputedStyle(track).width).toBe('4px')
			expect(track.getAnimations()).toHaveLength(0)
		} finally {
			await commands.emulateReducedMotion(false)
		}
	},
)

it('keeps the bar, and the popover, while the pointer rests on them during playback', async () => {
	const { player } = await mountPlayer()
	const controls = query(player, '.amk-controls')
	await query(player, 'video', HTMLVideoElement).play()
	const popover = query(player, 'media-volume-popover')

	await userEvent.hover(query(player, 'media-container'))
	await userEvent.hover(query(player, 'amk-mute-button'))

	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(true)
	await expect.poll(() => getComputedStyle(popover).opacity).toBe('1')
	const popupBox = popover.getBoundingClientRect()
	expect(popupBox.top).toBeGreaterThanOrEqual(0)
	expect(popupBox.bottom).toBeLessThanOrEqual(window.innerHeight)
	expect(popupBox.bottom).toBeCloseTo(
		query(player, 'amk-mute-button').getBoundingClientRect().top,
		0,
	)
	// Move the pointer without Playwright scrolling the top-layer popup.
	await commands.mouseMove(popupBox.x + popupBox.width / 2, popupBox.y + popupBox.height / 2)
	await settle(2600)
	expect(Object.hasOwn(controls.dataset, 'visible')).toBe(true)
	expect(Object.hasOwn(popover.dataset, 'open')).toBe(true)
	for (let frame = 0; frame < 20; frame++) {
		await new Promise((resolve) => {
			requestAnimationFrame(resolve)
		})
		expect(getComputedStyle(controls).opacity).toBe('1')
		expect(popover.matches(':hover')).toBe(true)
	}

	await commands.mouseMove(5, 5)

	await expect.poll(() => Object.hasOwn(controls.dataset, 'visible'), { timeout: 4000 }).toBe(false)
	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(false)
})

it('closes the volume popover before the player lifts', async () => {
	const { player } = await mountPlayer()
	const popover = query(player, 'media-volume-popover')

	await userEvent.hover(query(player, 'amk-mute-button'))

	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(true)

	await userEvent.click(query(player, '[data-zoom-open]'))

	await expect.poll(() => viewer().dataset.state).toBe('open')
	// A popover still fading out when the lift comes is swapped for a closed copy
	expect(Object.hasOwn(query(player, 'media-volume-popover').dataset, 'open')).toBe(false)
	expect(currentLayer().contains(player)).toBe(true)
})

it('keeps the floated bar and popup visible while hovering the playing volume slider', async () => {
	const { player } = await mountPlayer()
	await query(player, 'video', HTMLVideoElement).play()
	await userEvent.hover(query(player, 'media-container'), { position: { x: 12, y: 12 } })
	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	const controls = query(player, '.amk-controls')
	const popover = query(player, 'media-volume-popover')

	// Wake controls that have gone idle on a slow run, since those can't be hovered.
	await commands.mouseMove(640, 300)
	await userEvent.hover(query(player, 'amk-mute-button'))

	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(true)
	await expect.poll(() => getComputedStyle(popover).opacity).toBe('1')
	const popupBox = popover.getBoundingClientRect()
	expect(popupBox.top).toBeGreaterThanOrEqual(0)
	expect(popupBox.bottom).toBeLessThanOrEqual(window.innerHeight)
	expect(popupBox.bottom).toBeCloseTo(
		query(player, 'amk-mute-button').getBoundingClientRect().top,
		0,
	)
	// Move the pointer without Playwright scrolling the top-layer popup.
	await commands.mouseMove(popupBox.x + popupBox.width / 2, popupBox.y + popupBox.height / 2)
	await settle(2600)
	expect(Object.hasOwn(controls.dataset, 'userInactive')).toBe(false)
	expect(getComputedStyle(controls).opacity).toBe('1')
	expect(Object.hasOwn(popover.dataset, 'open')).toBe(true)
})

it('opens the volume popover from the floated bar too, and keeps it open', async () => {
	const { player } = await mountPlayer()
	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	const popover = query(player, 'media-volume-popover')
	const mute = query(player, 'amk-mute-button')

	await userEvent.hover(mute)

	await expect.poll(() => popover.matches(':popover-open')).toBe(true)
	await settle(400)
	expect(popover.matches(':popover-open')).toBe(true)
	expect(popover.getBoundingClientRect().height).toBeGreaterThan(0)
	expect(popover.getBoundingClientRect().bottom).toBeLessThanOrEqual(
		mute.getBoundingClientRect().top,
	)
})

it('keeps the volume popover working after a trip through the lightbox', async () => {
	const { player } = await mountPlayer()
	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	await userEvent.click(query(viewer(), '.amk-lightbox-close'))
	await expect.poll(() => viewer().open).toBe(false)
	const popover = query(player, 'media-volume-popover')

	await commands.mouseMove(5, 5)
	await userEvent.hover(query(player, 'amk-mute-button'))

	await expect.poll(() => popover.matches(':popover-open')).toBe(true)
	await settle(400)
	expect(popover.matches(':popover-open')).toBe(true)
	expect(popover.getBoundingClientRect().height).toBeGreaterThan(0)
})

it.each(['inline', 'lifted', 'returned'])(
	'toggles mute once per click and keeps volume open when %s',
	async (phase) => {
		const { item, player } = await mountPlayer()
		const video = query(player, 'video', HTMLVideoElement)
		const mute = query(player, 'amk-mute-button')

		if (phase !== 'inline') {
			await openLightbox(item)
			await liftDone()
		}

		if (phase === 'returned') {
			await closeLightbox()
		}

		const popover = query(player, 'media-volume-popover')
		await userEvent.hover(mute)
		await expect.poll(() => popover.matches(':popover-open')).toBe(true)
		for (const _ of [0, 1]) {
			const wasMuted = video.muted
			await userEvent.click(mute)
			await expect.poll(() => video.muted, { message: phase }).toBe(!wasMuted)
			await expect.poll(() => popover.matches(':popover-open')).toBe(true)
			await settle(200)
			expect(popover.matches(':popover-open')).toBe(true)
			expect(mute.getAttribute('aria-expanded')).toBe('true')
		}
	},
)

it('keeps keyboard mute and slider controls working, and dismisses the popup before the viewer', async () => {
	const { item, player } = await mountPlayer()
	await openLightbox(item)
	await liftDone()
	const mute = query(player, 'amk-mute-button')
	const popover = query(player, 'media-volume-popover')
	const video = query(player, 'video', HTMLVideoElement)
	mute.focus()
	await expect.poll(() => popover.matches(':popover-open')).toBe(true)
	for (const key of ['{Enter}', ' ']) {
		const wasMuted = video.muted
		await userEvent.keyboard(key)
		await expect.poll(() => video.muted).toBe(!wasMuted)
		expect(popover.matches(':popover-open')).toBe(true)
	}

	await userEvent.keyboard('{Tab}')
	expect(query(popover, 'media-volume-slider').contains(document.activeElement)).toBe(true)
	await userEvent.keyboard('{ArrowDown}')
	await expect.poll(() => video.volume).toBeLessThan(1)
	await userEvent.keyboard('{Escape}')
	await expect.poll(() => popover.matches(':popover-open')).toBe(false)
	expect(viewer().open).toBe(true)
	await userEvent.keyboard('{Escape}')
	await expect.poll(() => viewer().open).toBe(false)
})

it.each([false, true])(
	'fades and slides the volume popup open and closed, lifted=%s',
	async (lifted) => {
		const { item, player } = await mountPlayer()
		if (lifted) {
			await openLightbox(item)
			await liftDone()
		}

		const mute = query(player, 'amk-mute-button')
		const popover = query(player, 'media-volume-popover')
		const transitions: Array<{
			closing: boolean
			duration: number
			easing: string | undefined
			property: string
		}> = []
		popover.addEventListener('transitionrun', (event) => {
			if (event.target !== popover) {
				return
			}

			const animation = popover
				.getAnimations()
				.find(
					(animation) =>
						animation instanceof CSSTransition &&
						animation.transitionProperty === event.propertyName,
				)
			const timing = animation!.effect!.getTiming()
			transitions.push({
				closing: Object.hasOwn(popover.dataset, 'endingStyle'),
				duration: Number(timing.duration),
				easing: timing.easing,
				property: event.propertyName,
			})
		})
		await userEvent.hover(mute)
		await expect.poll(() => popover.matches(':popover-open')).toBe(true)
		await expect.poll(() => getComputedStyle(popover).opacity).toBe('1')
		expect(getComputedStyle(popover).borderRadius).toBe('0px')
		await commands.mouseMove(5, 5)
		await expect.poll(() => popover.matches(':popover-open')).toBe(false)
		for (const closing of [false, true]) {
			for (const property of ['opacity', 'transform']) {
				expect(transitions).toContainEqual({
					closing,
					duration: 200,
					easing: 'cubic-bezier(0.2, 0.8, 0.1, 1)',
					property,
				})
			}
		}

		player
			.closest<HTMLElement>('.amk-video')!
			.style.setProperty('--amk-volume-popover-transition-duration', '0.3s')
		expect(getComputedStyle(popover).transitionDuration).toBe('0.3s')
		await commands.emulateReducedMotion(true)
		try {
			expect(getComputedStyle(popover).transitionDuration).toBe('0s')
		} finally {
			await commands.emulateReducedMotion(false)
		}
	},
)

it.each([true, false])(
	'toggles Vimeo mute when runtime state differs from defaultMuted=%s',
	async (defaultMuted) => {
		const { item, player } = await mountPlayer()
		const media = document.createElement('vimeo-video')
		media.toggleAttribute('muted', defaultMuted)
		query(player, 'video').replaceWith(media)
		setVideoSource(media, '')
		// Vimeo reports its runtime state after loading. No remote iframe or SDK
		// response is needed to exercise the real adapter and custom-element bridge.
		media.adapter.muted = !defaultMuted
		media.dispatchEvent(new Event('volumechange'))
		const mute = query(player, 'amk-mute-button')
		await expect.poll(() => mute.getAttribute('aria-label')).toBe(defaultMuted ? 'Mute' : 'Unmute')
		expect(media.hasAttribute('muted')).toBe(defaultMuted)
		await userEvent.click(mute)
		await expect.poll(() => media.muted).toBe(defaultMuted)
		await userEvent.click(mute)
		await expect.poll(() => media.muted).toBe(!defaultMuted)

		await openLightbox(item)
		await liftDone()
		await userEvent.click(mute)
		await expect.poll(() => media.muted).toBe(defaultMuted)
		await userEvent.keyboard('m')
		await expect.poll(() => media.muted).toBe(!defaultMuted)
		await closeLightbox()
		await userEvent.click(mute)
		await expect.poll(() => media.muted).toBe(defaultMuted)
		expect(media.adapter.defaultMuted).toBe(defaultMuted)
	},
)

it.each([false, true])('uses the entire volume popup as a hit area, lifted=%s', async (lifted) => {
	const { item, player } = await mountPlayer()
	if (lifted) {
		await openLightbox(item)
		await liftDone()
	}

	const video = query(player, 'video', HTMLVideoElement)
	const popover = query(player, 'media-volume-popover')
	await userEvent.hover(query(player, 'amk-mute-button'))
	await expect.poll(() => popover.matches(':popover-open')).toBe(true)
	await expect.poll(() => getComputedStyle(popover).opacity).toBe('1')
	const box = popover.getBoundingClientRect()
	for (const x of [box.left + 1, box.right - 1]) {
		for (const [y, volume] of [
			[box.bottom - 1, 0],
			[box.top + 1, 1],
			[box.top + box.height / 2, 0.5],
		] as const) {
			await commands.mouseDown(x, y)
			await commands.mouseUp()
			await expect.poll(() => video.volume).toBeCloseTo(volume, 2)
			expect(popover.matches(':popover-open')).toBe(true)
		}
	}
})

it('leaves slider arrows to volume adjustment inside a gallery and supports dragging', async () => {
	const { item, player } = await mountPlayer()
	item.dataset.gallery = 'controls'
	query(document, '#video-minimal .amk-zoom').dataset.gallery = 'controls'
	await openLightbox(item)
	await liftDone()
	const video = query(player, 'video', HTMLVideoElement)
	const popover = query(player, 'media-volume-popover')
	await userEvent.hover(query(player, 'amk-mute-button'))
	await expect.poll(() => popover.matches(':popover-open')).toBe(true)
	const thumb = query(popover, '[role="slider"]')
	thumb.focus()
	await userEvent.keyboard('{ArrowLeft}')
	await expect.poll(() => video.volume).toBeCloseTo(0.95, 5)
	await userEvent.keyboard('{ArrowRight}')
	await expect.poll(() => video.volume).toBe(1)
	expect(currentLayer().contains(player)).toBe(true)

	const slider = query(popover, 'media-volume-slider').getBoundingClientRect()
	await commands.mouseDown(slider.x + slider.width / 2, slider.y + slider.height / 4)
	await commands.mouseMove(slider.x + slider.width / 2, slider.y + slider.height * 0.75)
	await commands.mouseUp()
	await expect.poll(() => video.volume).toBeLessThan(0.5)
	expect(video.muted).toBe(false)
	expect(popover.matches(':popover-open')).toBe(true)
	expect(currentLayer().contains(player)).toBe(true)
})

it('only fades its bar in the page as the controls hide and show', async () => {
	const { player } = await mountPlayer()
	const controls = query(player, '.amk-controls')
	const bar = query(player, '.amk-bar')
	const container = query(player, 'media-container')
	await query(player, 'video', HTMLVideoElement).play()
	await userEvent.hover(container, { position: { x: 12, y: 12 } })
	await expect.poll(() => Object.hasOwn(controls.dataset, 'visible')).toBe(true)
	// Where the bar sits in its container, whatever the page does around it
	const offset = () => bar.getBoundingClientRect().top - container.getBoundingClientRect().top
	const resting = offset()
	expect(bar.getBoundingClientRect().bottom).toBeCloseTo(
		container.getBoundingClientRect().bottom,
		0,
	)

	delete controls.dataset.visible
	await expect.poll(() => getComputedStyle(controls).opacity).toBe('0')
	expect(offset()).toBeCloseTo(resting, 0)
	expect(getComputedStyle(controls).transitionDuration).toBe('0.2s')

	controls.dataset.visible = ''
	await expect.poll(() => getComputedStyle(controls).opacity).toBe('1')
	expect(offset()).toBeCloseTo(resting, 0)
})

it('returns its bar on the active thumbnail fade without a second opacity transition', async () => {
	const { item, player } = await mountPlayer()
	item.style.setProperty('--amk-lightbox-close-fade-duration', '800ms')
	const controls = query(player, '.amk-controls')
	const bar = query(player, '.amk-bar')
	const container = query(player, 'media-container')
	await expect.poll(() => Object.hasOwn(controls.dataset, 'visible')).toBe(true)

	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	expect(getComputedStyle(controls).filter).toBe('none')
	await expect
		.poll(() => getComputedStyle(item).getPropertyValue('--amk-page-controls-opacity'))
		.toBe('0')
	viewer().requestClose()
	await expect.poll(() => viewer().open).toBe(false)

	// Back in the player, already at its resting position while it fades in.
	expect(controls.hasAttribute('popover')).toBe(false)
	const { bottom } = container.getBoundingClientRect()
	expect(bar.getBoundingClientRect().bottom).toBeCloseTo(bottom, 0)
	expect(getComputedStyle(bar).translate).toBe('none')
	expect(getComputedStyle(controls).opacity).toBe('1')
	expect(
		controls
			.getAnimations()
			.filter((animation) => animation instanceof CSSTransition)
			.map((animation) => animation.transitionProperty),
	).not.toContain('opacity')
	expect(
		item
			.getAnimations()
			.filter((animation) => animation instanceof CSSTransition)
			.map((animation) => animation.transitionProperty),
	).toContain('--amk-page-controls-opacity')
	await expect.poll(() => getComputedStyle(controls).filter).toBe('opacity(1)')
	expect(getComputedStyle(query(player, '.amk-media')).filter).toBe('none')
})

it.each([false, true])('crossfades video with its page preview, playing=%s', async (playing) => {
	const { item, player } = await mountPlayer()
	if (playing) {
		await query(player, 'video', HTMLVideoElement).play()
	}

	const opening = openLightbox(item)
	const layer = currentLayer()
	const entering = fadeOf(layer)!
	expect(entering).toBeDefined()
	entering.pause()
	entering.currentTime = 0
	expect(getComputedStyle(layer).opacity).toBe('0')
	entering.finish()
	await opening
	const closing = closeLightbox()
	const leaving = fadeOf(layer)!
	expect(leaving).toBeDefined()
	leaving.pause()
	leaving.currentTime = 0
	expect(getComputedStyle(layer).opacity).toBe('1')
	expect(layer.style.opacity).toBe('0')
	leaving.finish()
	await closing
})

it.each(['video', 'video-minimal'])(
	'uses the %s surface for playback and only its button for zoom',
	async (id) => {
		const fixture = await mountPage('/zoom/')
		document.dispatchEvent(new Event('astro:page-load'))
		const player = query(fixture, `#${id} video-player`)
		const video = query(player, 'video', HTMLVideoElement)
		const container = query(player, 'media-container')
		await userEvent.click(container, { position: { x: 12, y: 12 } })
		await expect.poll(() => video.paused).toBe(false)
		expect(document.querySelector('dialog.amk-lightbox[open]')).toBeNull()
		await userEvent.click(container, { position: { x: 12, y: 12 } })
		await expect.poll(() => video.paused).toBe(true)
		expect(document.querySelector('dialog.amk-lightbox[open]')).toBeNull()
		await userEvent.click(query(player, '[data-zoom-open]'))
		await expect.poll(() => viewer().open).toBe(true)
	},
)

it.each(['video', 'video-minimal', 'video-zoom-only'])(
	'keeps paused %s controls visible and hides idle playing controls sooner',
	async (id) => {
		const fixture = await mountPage('/zoom/')
		document.dispatchEvent(new Event('astro:page-load'))
		const player = query(fixture, `#${id} video-player`)
		const video = query(player, 'video', HTMLVideoElement)
		const controls = query(player, '.amk-controls')
		await commands.mouseMove(5, 5)
		await settle(1700)
		expect(getComputedStyle(controls).opacity).toBe('1')
		await userEvent.hover(query(player, 'media-container'), { position: { x: 12, y: 12 } })
		await video.play()
		await expect
			.poll(() => Object.hasOwn(controls.dataset, 'visible'), { timeout: 1900 })
			.toBe(false)
		await expect.poll(() => getComputedStyle(controls).opacity).toBe('0')
		video.pause()
		await commands.mouseMove(5, 5)
		await expect.poll(() => getComputedStyle(controls).opacity).toBe('1')
		expect(getComputedStyle(controls).transitionDuration).toBe('0.2s')
	},
)

it('puts the zoom-only button at the bottom right without a toolbar background', async () => {
	const fixture = await mountPage('/zoom/')
	const player = query(fixture, '#video-zoom-only video-player')
	const button = query(player, '[data-zoom-open]').getBoundingClientRect()
	const container = query(player, 'media-container').getBoundingClientRect()
	expect(button.right).toBeCloseTo(container.right, 0)
	expect(button.bottom).toBeCloseTo(container.bottom, 0)
	expect(getComputedStyle(query(player, '.amk-bar')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
})

it.each(['video-minimal', 'video-zoom-only'])(
	'shows the paused %s expand button only while hovered',
	async (id) => {
		const fixture = await mountPage('/zoom/')
		const player = query(fixture, `#${id} video-player`)
		const bar = query(player, '.amk-bar')
		await commands.mouseMove(5, 5)
		await expect.poll(() => getComputedStyle(bar).opacity).toBe('0')
		await userEvent.hover(query(player, 'media-container'))
		await expect.poll(() => getComputedStyle(bar).opacity).toBe('1')
		await commands.mouseMove(5, 5)
		await expect.poll(() => getComputedStyle(bar).opacity).toBe('0')
	},
)

it('never paints a stale expand tooltip during a trip through the lightbox', async () => {
	const { player } = await mountPlayer()
	const button = query(player, '[data-zoom-open]')
	await userEvent.hover(button)
	await expect.poll(() => query(player, '.amk-zoom-tooltip').matches(':popover-open')).toBe(true)
	await userEvent.click(button)
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	expect(button.checkVisibility()).toBe(false)
	await userEvent.click(query(viewer(), '.amk-lightbox-close'))
	for (let frame = 0; frame < 45; frame++) {
		await new Promise((resolve) => {
			requestAnimationFrame(resolve)
		})
		const tooltip = query(player, '.amk-zoom-tooltip')
		expect(tooltip.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).toBe(false)
	}

	expect(viewer().open).toBe(false)
	await userEvent.hover(query(player, 'media-container'))
	await userEvent.hover(button)
	await expect
		.poll(() =>
			query(player, '.amk-zoom-tooltip').checkVisibility({
				checkOpacity: true,
				checkVisibilityCSS: true,
			}),
		)
		.toBe(true)
})

it.each(['video', 'video-minimal', 'video-zoom-only'])(
	'gives the lifted %s surface to dragging and hides its expand button',
	async (id) => {
		const fixture = await mountPage('/zoom/')
		document.dispatchEvent(new Event('astro:page-load'))
		const item = boxes(query(fixture, `#${id}`))[0]!
		const player = query(item, 'video-player')
		const video = query(player, 'video', HTMLVideoElement)
		await openLightbox(item)
		await liftDone()
		expect(query(player, '[data-zoom-open]').checkVisibility()).toBe(false)
		expect(query(player, '.amk-controls').matches(':popover-open')).toBe(id !== 'video-zoom-only')

		const box = query(player, 'media-container').getBoundingClientRect()
		const x = box.x + box.width / 2
		const y = box.y + box.height / 2
		await commands.mouseDown(x, y)
		await commands.mouseMove(x, y + 70)
		await expect.poll(() => Object.hasOwn(viewer().dataset, 'dismissing')).toBe(true)
		expect(video.paused).toBe(true)
		await commands.mouseMove(x, y)
		await commands.mouseUp()
		await settle(150)
		expect(video.paused).toBe(true)
		await closeLightbox()
		expect(query(player, '[data-zoom-open]').checkVisibility()).toBe(true)
		if (id === 'video-zoom-only') {
			return
		}

		await userEvent.click(query(player, 'media-container'), { position: { x: 12, y: 12 } })
		await expect.poll(() => video.paused).toBe(false)
	},
)

it('keeps a lifted playback tooltip beside its button after scrolling the page', async () => {
	const { item, player } = await mountPlayer()
	await userEvent.hover(query(player, 'media-container'))
	await openLightbox(item)
	await liftDone()
	const button = query(player, '.amk-playback media-play-button')
	await userEvent.hover(button)
	const tooltip = query(player, `media-tooltip[trigger="${button.id}"]`)
	await expect.poll(() => tooltip.matches(':popover-open')).toBe(true)
	const box = tooltip.getBoundingClientRect()
	expect(box.top).toBeGreaterThanOrEqual(0)
	expect(box.bottom).toBeCloseTo(button.getBoundingClientRect().top - 6, 0)
})
