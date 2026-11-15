// How a player takes taps, clicks, and drags, on the page and lifted into the
// viewer: its surface plays and pauses, and shows its controls, rather than
// opening or closing anything, while a drag of it still navigates or
// dismisses. And how its controls show a video without sound.

import { afterEach, expect, it } from 'vitest'
import { commands, server, userEvent } from 'vitest/browser'
import { disposeCarousels, setUpCarousels } from '../../src/components/internal/carousel/carousel'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import '../../src/components/internal/carousel/carousel.css'
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
	waitForMedia,
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
	await waitForMedia(video)
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
	if (server.browser === 'chromium') {
		await commands.touchTap(x, y)
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
		// Watch each tap through its release task, including microtasks. The normal
		// idle timer may hide controls between remote commands on a slow runner.
		const hidings: MutationRecord[] = []
		const observer = new MutationObserver((records) => {
			// A redundant write of data-visible is not a hiding. The next record's
			// old value also catches a removal followed by a show in the same task.
			for (const [index, record] of records.entries()) {
				const next = records[index + 1]
				const value = next ? (next.oldValue ?? undefined) : controls.dataset.visible
				if (value === undefined && record.oldValue !== null) {
					hidings.push(record)
				}
			}
		})
		let releaseTimer: ReturnType<typeof setTimeout> | undefined
		const startTap = () => {
			observer.observe(controls, { attributeFilter: ['data-visible'], attributeOldValue: true })
		}

		const endTap = () => {
			releaseTimer = setTimeout(() => observer.disconnect(), 0)
		}

		container.addEventListener('pointerdown', startTap, { capture: true })
		container.addEventListener('pointerup', endTap, { capture: true })
		await commands.mouseMove(5, 5)

		try {
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
			clearTimeout(releaseTimer)
			container.removeEventListener('pointerdown', startTap, { capture: true })
			container.removeEventListener('pointerup', endTap, { capture: true })
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

// Native touch commands are Chromium-only; skip before loading and playing media.
it.skipIf(server.browser !== 'chromium')(
	'plays and pauses a lifted video from a touch tap, and shows its bar',
	async () => {
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
		const clicks: PointerEvent[] = []
		player.addEventListener('click', (event) => {
			clicks.push(event)
		})
		expect(await commands.touchTap(x, y)).toBe(true)

		await expect.poll(() => clicks.length).toBe(1)
		expect(clicks[0]!.isTrusted).toBe(true)
		expect(clicks[0]!.pointerType).toBe('touch')
		await expect.poll(() => video.paused).toBe(true)
		expect(Object.hasOwn(controls.dataset, 'userInactive')).toBe(false)
		expect(controls.matches(':popover-open')).toBe(true)
		await commands.touchTap(x, y)
		await expect.poll(() => clicks.length).toBe(2)
		await expect.poll(() => video.paused).toBe(false)
		expect(viewer().dataset.state).toBe('open')
		await closeLightbox()
	},
)

it('drags a playing video down and back, or aside to the next, without pausing it', async () => {
	const fixture = await mountPage('/video-gallery/')
	document.dispatchEvent(new Event('astro:page-load'))
	const [first, second] = boxes(fixture)
	const player = query(first!, 'video-player')
	const video = query(player, 'video', HTMLVideoElement)
	const next = query(second!, 'video', HTMLVideoElement)
	await waitForMedia(video)
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

it('keeps the cursor over a lifted video while pressed, until the press drags', async () => {
	const { item, player } = await mountVideo('/zoom/', 'video')
	await openLightbox(item)
	await liftDone()
	const track = query(viewer(), '.amk-lightbox-track')
	let pointerId: number | undefined
	track.addEventListener(
		'pointerdown',
		(event) => {
			pointerId = event.pointerId
		},
		{ once: true },
	)
	const { x, y } = middleOf(query(player, 'media-container'))
	try {
		await commands.mouseDown(x, y)
		// A pointer the track captured would show its cursor, zoom-out
		expect(track.hasPointerCapture(pointerId!)).toBe(false)
		await commands.mouseMove(x - 20, y)
		await commands.mouseMove(x - 200, y)
		expect(track.hasPointerCapture(pointerId!)).toBe(true)
	} finally {
		await commands.mouseUp()
	}

	await closeLightbox()
})

it('takes its keyboard shortcuts in the lightbox, which keeps its own keys', async () => {
	const { item, player, video } = await mountVideo('/zoom/', 'video')
	await openLightbox(item)
	await liftDone()
	expect(player.contains(document.activeElement)).toBe(false)
	await userEvent.keyboard('k')
	await expect.poll(() => video.paused).toBe(false)
	await userEvent.keyboard('k')
	await expect.poll(() => video.paused).toBe(true)
	expect(video.muted).toBe(true)
	await userEvent.keyboard('m')
	await expect.poll(() => video.muted).toBe(false)
	expect(viewer().dataset.state).toBe('open')
	await userEvent.keyboard('{Escape}')
	await expect.poll(() => viewer().open).toBe(false)
})

it('drags a page carousel from a video, which a click still plays and pauses', async () => {
	const { player, video } = await mountVideo('/carousel-player/', 'player')
	setUpCarousels()
	try {
		const track = query(document, '#player .amk-carousel-track')
		const box = query(player, 'media-container').getBoundingClientRect()
		// Clear of the carousel's buttons, and of the player's bar
		const y = box.y + box.height / 4
		await commands.mouseDown(box.x + 60, y)
		await commands.mouseUp()
		await expect.poll(() => video.paused).toBe(false)
		await commands.mouseDown(box.x + 60, y)
		await commands.mouseUp()
		await expect.poll(() => video.paused).toBe(true)

		// Past halfway, so the release settles on the next slide at any speed
		await commands.mouseDown(box.right - 20, y)
		await commands.mouseMove(box.right - 40, y)
		await commands.mouseMove(box.x + 20, y)
		await commands.mouseUp()
		await expect.poll(() => Math.round(Math.abs(track.scrollLeft) / track.clientWidth)).toBe(1)
		await settle(150)
		expect(video.paused).toBe(true)
		expect(document.getSelection()?.isCollapsed ?? true).toBe(true)
	} finally {
		disposeCarousels()
	}
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
