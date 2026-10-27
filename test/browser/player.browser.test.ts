// The kit's Video.js player, as the components render it, lifted whole into the
// viewer: its own control bar floats over the viewer, its zoom button closes
// the viewer again, and its poster stands in for it on the page.

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
	expect(item.dataset.interactive).toBe('')

	await userEvent.click(query(player, 'media-play-button'))

	expect(document.querySelector('dialog.amk-lightbox[open]')).toBeNull()
})

it('lifts the whole player from its zoom button, floats its controls, and closes from the same button', async () => {
	const { item, player } = await mountPlayer()
	const button = query(player, '[data-zoom-open]')
	const controls = query(player, '.amk-controls')
	const enter = query(button, '.amk-icon-zoom-enter')
	const exit = query(button, '.amk-icon-zoom-exit')
	expect(getComputedStyle(enter).display).not.toBe('none')
	expect(getComputedStyle(exit).display).toBe('none')

	await userEvent.click(button)

	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	expect(isLifted(item)).toBe(true)
	expect(currentLayer().contains(player)).toBe(true)
	expect(viewer().contains(controls)).toBe(true)
	expect(controls.getAttribute('popover')).toBe('manual')
	expect(controls.matches(':popover-open')).toBe(true)
	expect(getComputedStyle(enter).display).toBe('none')
	expect(getComputedStyle(exit).display).not.toBe('none')
	const frame = query(viewer(), '.amk-lightbox-frame').getBoundingClientRect()
	expect(frame.width / frame.height).toBeCloseTo(16 / 9, 1)

	await userEvent.click(button)

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

	await userEvent.click(query(player, '[data-zoom-open]'))

	await expect.poll(() => viewer().dataset.state).toBe('open')
	expect(player.dataset.controls).toBe('lightbox')
	expect(getComputedStyle(playback).display).toBe('contents')
	expect(getComputedStyle(query(playback, 'media-play-button')).display).not.toBe('none')
	expect(getComputedStyle(centerPlay).display).toBe('none')
	await liftDone()

	await userEvent.click(query(player, '[data-zoom-open]'))

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
	expect(popover.getBoundingClientRect().bottom).toBeCloseTo(button.top, 0)
	expect(Math.abs(slider.x + slider.width / 2 - (button.x + button.width / 2))).toBeLessThan(2)

	await commands.mouseMove(5, 5)

	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(false)
})

it('keeps the bar, and the popover, while the pointer rests on them during playback', async () => {
	const { player } = await mountPlayer()
	const controls = query(player, '.amk-controls')
	await query(player, 'video', HTMLVideoElement).play()
	const popover = query(player, 'media-volume-popover')

	await userEvent.hover(query(player, 'amk-mute-button'))

	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(true)
	await settle(2600)
	expect(Object.hasOwn(controls.dataset, 'visible')).toBe(true)
	expect(Object.hasOwn(popover.dataset, 'open')).toBe(true)

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

it('keeps the floated bar while the pointer rests on it', async () => {
	const { player } = await mountPlayer()
	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	const controls = query(player, '.amk-controls')
	const popover = query(player, 'media-volume-popover')

	await userEvent.hover(query(player, 'amk-mute-button'))

	await expect.poll(() => Object.hasOwn(popover.dataset, 'open')).toBe(true)
	await settle(2600)
	expect(Object.hasOwn(controls.dataset, 'userInactive')).toBe(false)
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
	await userEvent.click(query(player, '[data-zoom-open]'))
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

it('raises its bar back into the player as the lightbox closes', async () => {
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

	// Back in the player, on its way up from under the edge
	expect(controls.hasAttribute('popover')).toBe(false)
	const { bottom } = container.getBoundingClientRect()
	expect(bar.getBoundingClientRect().bottom).toBeGreaterThan(bottom + 1)
	await expect.poll(() => bar.getBoundingClientRect().bottom).toBeCloseTo(bottom, 0)
	expect(getComputedStyle(controls).opacity).toBe('1')
})
