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
	currentLayer,
	fadeOf,
	isLifted,
	liftDone,
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
	return { item, player }
}

it('is not a button, and leaves clicks on its controls to the player', async () => {
	const { item, player } = await mountPlayer()
	expect(item.hasAttribute('role')).toBe(false)
	expect(item.hasAttribute('tabindex')).toBe(false)
	expect(item.dataset.zoomInteractive).toBe('')

	await userEvent.click(query(player, 'media-play-button'))

	expect(document.querySelector('dialog.amk-lightbox[open]')).toBeNull()
})

it('lifts the whole player, hides expand, and closes from the lightbox button', async () => {
	const { item, player } = await mountPlayer()
	const button = query(player, '[data-zoom-open]')
	const controls = query(player, '.amk-controls')
	expect(getComputedStyle(button).display).not.toBe('none')

	await userEvent.click(button)

	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	expect(isLifted(item)).toBe(true)
	expect(currentLayer().contains(player)).toBe(true)
	expect(viewer().contains(controls)).toBe(true)
	expect(controls.getAttribute('popover')).toBe('manual')
	expect(controls.matches(':popover-open')).toBe(true)
	expect(getComputedStyle(button).display).toBe('none')
	const frame = query(viewer(), '.amk-lightbox-frame').getBoundingClientRect()
	expect(frame.width / frame.height).toBeCloseTo(16 / 9, 1)

	await userEvent.click(query(viewer(), '.amk-lightbox-close'))

	await expect.poll(() => viewer().open).toBe(false)
	expect(item.contains(player)).toBe(true)
	expect(controls.hasAttribute('popover')).toBe(false)
	expect(isLifted(item)).toBe(false)
})

it('stands its poster in for the player while it is lifted', async () => {
	const { item } = await mountPlayer()
	await expect.poll(() => item.querySelector('media-poster[data-visible]')).not.toBeNull()
	const container = query(item, 'media-container').getBoundingClientRect()

	await userEvent.click(query(item, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')

	const preview = query(item, '[data-preview]', HTMLImageElement)
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
	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	const controls = query(player, '.amk-controls')
	expect(Object.hasOwn(controls.dataset, 'userInactive')).toBe(false)

	query(controls, 'media-play-button').focus()
	await new Promise((resolve) => {
		setTimeout(resolve, 2300)
	})
	expect(Object.hasOwn(controls.dataset, 'userInactive')).toBe(false)

	viewer().focus()
	await expect
		.poll(() => Object.hasOwn(controls.dataset, 'userInactive'), { timeout: 4000 })
		.toBe(true)
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
	expect(Object.hasOwn(popover.dataset, 'open')).toBe(false)
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

	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(true)
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

	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(true)
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

it('uses a rectangular volume popup with fast transitions and respects reduced motion', async () => {
	const { player } = await mountPlayer()
	const mute = query(player, 'amk-mute-button')
	const popover = query(player, 'media-volume-popover')
	await userEvent.hover(mute)
	await expect.poll(() => popover.matches(':popover-open')).toBe(true)
	expect(getComputedStyle(popover).borderRadius).toBe('0px')
	expect(getComputedStyle(popover).transitionDuration).toBe('0.06s')
	await commands.emulateReducedMotion(true)
	try {
		expect(getComputedStyle(popover).transitionDuration).toBe('0s')
	} finally {
		await commands.emulateReducedMotion(false)
	}
})

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
	await expect.poll(() => video.volume).toBe(0.95)
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

it('fades its bar back into the player without sliding as the lightbox closes', async () => {
	const { player } = await mountPlayer()
	const controls = query(player, '.amk-controls')
	const bar = query(player, '.amk-bar')
	const container = query(player, 'media-container')
	await expect.poll(() => Object.hasOwn(controls.dataset, 'visible')).toBe(true)

	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	viewer().requestClose()
	await expect.poll(() => viewer().open).toBe(false)

	// Back in the player, already at its resting position while it fades in.
	expect(controls.hasAttribute('popover')).toBe(false)
	const { bottom } = container.getBoundingClientRect()
	expect(bar.getBoundingClientRect().bottom).toBeCloseTo(bottom, 0)
	expect(getComputedStyle(bar).translate).toBe('none')
	await expect.poll(() => getComputedStyle(controls).opacity).toBe('1')
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
