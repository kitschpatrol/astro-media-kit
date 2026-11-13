// How a player takes taps, clicks, and drags, on the page and lifted into the
// viewer: its surface plays and pauses, and shows its controls, rather than
// opening or closing anything, while a drag of it still navigates or
// dismisses. And how its controls show a video without sound.

import { afterEach, expect, it } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import '../../src/components/internal/videojs-ui'
import '../../src/components/internal/videojs-media'
import '../../src/components/internal/amk-video.css'
import {
	activeSlideLabel,
	boxes,
	cleanUp,
	currentLayer,
	frames,
	liftDone,
	middleOf,
	mountPage,
	query,
	settle,
	setUpLightbox,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

/**
 * The item, player, and video in the section with `id` of a fixture page, its
 * media source assigned as on load, and loaded far enough to play.
 */
async function mountVideo(
	path: string,
	id: string,
): Promise<{ item: HTMLElement; player: HTMLElement; video: HTMLVideoElement }> {
	const fixture = await mountPage(path)
	// The media script assigns `data-src` sources on load and after navigation
	document.dispatchEvent(new Event('astro:page-load'))
	const section = query(fixture, `#${id}`)
	const player = query(section, 'video-player')
	const video = query(player, 'video', HTMLVideoElement)
	await customElements.whenDefined('video-player')
	await expect.poll(() => video.readyState, { timeout: 10_000 }).toBeGreaterThan(0)
	return { item: boxes(section)[0] ?? section, player, video }
}

/**
 * Tap `element` near its top-left corner with a finger: a real one where the
 * browser takes touch input, whose listeners each run their microtasks before
 * the next, as on a touch screen, or else dispatched pointer events.
 */
async function touchTap(element: Element) {
	const box = element.getBoundingClientRect()
	const x = box.x + 12
	const y = box.y + 12
	if (await commands.touchDown(x, y)) {
		await commands.touchUp()
		return
	}

	for (const type of ['pointerdown', 'pointerup']) {
		element.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				clientX: x,
				clientY: y,
				isPrimary: true,
				pointerId: 7,
				pointerType: 'touch',
			}),
		)
	}
}

it.each(['video', 'video-minimal'])(
	'plays and pauses %s on each touch tap, showing its controls, and never hides them for one',
	async (id) => {
		const { player, video } = await mountVideo('/zoom/', id)
		const controls = query(player, '.amk-controls')
		const container = query(player, 'media-container')
		const isVisible = () => Object.hasOwn(controls.dataset, 'visible')
		// On screen, for a finger to reach
		container.scrollIntoView({ behavior: 'instant', block: 'center' })
		// Every time the controls go, even for a moment within a task: a change
		// from a value is a removal, since the attribute has no other value
		const hidings: MutationRecord[] = []
		const observer = new MutationObserver((records) => {
			hidings.push(...records.filter((record) => record.oldValue !== null))
		})
		await commands.mouseMove(5, 5)

		try {
			observer.observe(controls, { attributeFilter: ['data-visible'], attributeOldValue: true })
			// A tap plays, and the next pauses while the controls are still up
			await touchTap(container)
			await expect.poll(() => video.paused).toBe(false)
			await frames(2)
			expect(isVisible()).toBe(true)
			await touchTap(container)
			await expect.poll(() => video.paused).toBe(true)
			await frames(2)
			expect(hidings).toEqual([])
		} finally {
			observer.disconnect()
		}

		// Playing with the controls gone, a tap brings them back as it pauses, and
		// the next plays with them staying until idle rather than going as it does
		await touchTap(container)
		await expect.poll(isVisible, { timeout: 4000 }).toBe(false)
		expect(video.paused).toBe(false)
		await touchTap(container)
		await expect.poll(() => video.paused).toBe(true)
		expect(isVisible()).toBe(true)
		await touchTap(container)
		await expect.poll(() => video.paused).toBe(false)
		await frames(2)
		expect(isVisible()).toBe(true)
		await expect.poll(isVisible, { timeout: 4000 }).toBe(false)
	},
)

it.each(['video', 'video-minimal'])(
	'plays and pauses the lifted %s from a click on it, and stays open',
	async (id) => {
		const { item, player, video } = await mountVideo('/zoom/', id)
		await openLightbox(item)
		await liftDone()
		// The cursor shows that a click is for the player, not for closing
		expect(getComputedStyle(currentLayer()).cursor).toBe('auto')
		const { x, y } = middleOf(query(player, 'media-container'))
		await commands.mouseDown(x, y)
		await commands.mouseUp()
		await expect.poll(() => video.paused).toBe(false)
		await commands.mouseDown(x, y)
		await commands.mouseUp()
		await expect.poll(() => video.paused).toBe(true)
		await settle(150)
		expect(viewer().dataset.state).toBe('open')
		await closeLightbox()
	},
)

it('plays and pauses a zoomable video from a click, zoomed or not, leaving zoom to its button', async () => {
	const { item, player, video } = await mountVideo('/zoom/', 'video')
	item.dataset.level = 'fill'
	await openLightbox(item)
	await liftDone()
	const isZoomed = () => viewer().querySelector('[data-zoomed]') !== null
	const { x, y } = middleOf(query(player, 'media-container'))
	await commands.mouseDown(x, y)
	await commands.mouseUp()
	await expect.poll(() => video.paused).toBe(false)
	expect(isZoomed()).toBe(false)

	await userEvent.click(query(viewer(), '.amk-lightbox-zoom'))
	await expect.poll(isZoomed).toBe(true)
	await settle(150)
	const zoomed = middleOf(query(player, 'media-container'))
	const point = {
		x: Math.min(Math.max(zoomed.x, 100), window.innerWidth - 100),
		y: Math.min(Math.max(zoomed.y, 100), window.innerHeight - 200),
	}
	await commands.mouseDown(point.x, point.y)
	await commands.mouseUp()
	await expect.poll(() => video.paused).toBe(true)
	expect(isZoomed()).toBe(true)
	expect(viewer().dataset.state).toBe('open')
	await closeLightbox()
})

it('closes from a click on a lifted video without playback controls, as from an image', async () => {
	const { item, video } = await mountVideo('/zoom/', 'video-zoom-only')
	await openLightbox(item)
	await liftDone()
	expect(getComputedStyle(currentLayer()).cursor).toBe('zoom-out')
	const { x, y } = middleOf(currentLayer())
	await commands.mouseDown(x, y)
	await commands.mouseUp()
	await expect.poll(() => viewer().dataset.state).not.toBe('open')
	expect(video.paused).toBe(true)
})

it('plays and pauses a lifted video from a touch tap, and shows its bar', async ({ skip }) => {
	const { item, player, video } = await mountVideo('/zoom/', 'video')
	const controls = query(player, '.amk-controls')
	await openLightbox(item)
	await liftDone()
	await video.play()
	// Idle, the floated bar of a playing video hides
	await expect
		.poll(() => Object.hasOwn(controls.dataset, 'userInactive'), { timeout: 4000 })
		.toBe(true)
	const { x, y } = middleOf(query(player, 'media-container'))
	if (!(await commands.touchDown(x, y))) {
		skip()
	}

	await commands.touchUp()
	await expect.poll(() => video.paused).toBe(true)
	expect(Object.hasOwn(controls.dataset, 'userInactive')).toBe(false)
	expect(controls.matches(':popover-open')).toBe(true)
	await commands.touchDown(x, y)
	await commands.touchUp()
	await expect.poll(() => video.paused).toBe(false)
	expect(viewer().dataset.state).toBe('open')
	await closeLightbox()
})

it('drags a playing video down and back, or aside to the next, without pausing it', async () => {
	const fixture = await mountPage('/video-gallery/')
	document.dispatchEvent(new Event('astro:page-load'))
	const [first, second] = boxes(fixture)
	const player = query(first!, 'video-player')
	const video = query(player, 'video', HTMLVideoElement)
	const next = query(second!, 'video', HTMLVideoElement)
	await expect.poll(() => video.readyState, { timeout: 10_000 }).toBeGreaterThan(0)
	await openLightbox(first!)
	await liftDone()
	await video.play()
	await expect.poll(() => video.paused).toBe(false)

	const box = query(player, 'media-container').getBoundingClientRect()
	const x = box.right - 40
	const y = box.y + box.height / 2
	await commands.mouseDown(x, y)
	await commands.mouseMove(x, y + 70)
	await expect.poll(() => Object.hasOwn(viewer().dataset, 'dismissing')).toBe(true)
	await commands.mouseMove(x, y)
	await commands.mouseUp()
	await settle(150)
	expect(viewer().dataset.state).toBe('open')
	expect(video.paused).toBe(false)

	// Past halfway, so the release settles on the next slide at any speed
	await commands.mouseDown(x, y)
	await commands.mouseMove(x - 800, y)
	await commands.mouseUp()
	await expect.poll(activeSlideLabel).toBe('2 of 3')
	await settle(150)
	expect(video.paused).toBe(false)
	expect(next.paused).toBe(true)
	expect(viewer().dataset.state).toBe('open')
	await closeLightbox()
})

it('strikes out the volume of a video without sound, on the page and in the lightbox', async () => {
	const { item, player } = await mountVideo('/video-gallery/', 'silent')
	const button = query(player, 'button.amk-no-audio', HTMLButtonElement)
	const icon = query(button, '[data-amk-icon="no-audio"]')
	expect(button.disabled).toBe(true)
	expect(button.checkVisibility()).toBe(true)
	expect(icon.checkVisibility()).toBe(true)
	expect(getComputedStyle(icon).opacity).toBe('0.5')
	// It does nothing, so a press on it is one on the bar around it
	expect(getComputedStyle(button).pointerEvents).toBe('none')
	expect(player.querySelector('media-volume-popover')).toBeNull()

	await openLightbox(item)
	await liftDone()
	const controls = query(player, '.amk-controls')
	expect(controls.matches(':popover-open')).toBe(true)
	expect(button.checkVisibility()).toBe(true)
	expect(icon.checkVisibility()).toBe(true)
	// The picture of the bar left on the page draws it dimmed, as an inert copy
	const preview = query(item, '.amk-page-control-preview')
	expect(preview.querySelector('button')).toBeNull()
	expect(
		[...preview.querySelectorAll<HTMLElement>('span')].some(
			(span) => span.style.opacity === '0.5' && span.querySelector('svg') !== null,
		),
	).toBe(true)
	await closeLightbox()
})
