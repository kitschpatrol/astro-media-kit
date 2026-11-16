import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import '../../src/components/internal/videojs-ui'
import '../../src/components/internal/videojs-media'
import '../../src/components/internal/amk-video.css'
import {
	cleanUp,
	currentLayer,
	frames,
	mountPage,
	query,
	setUpLightbox,
	viewer,
	waitForMedia,
} from './helpers'

setUpLightbox()
afterEach(async () => {
	await cleanUp()
	vi.restoreAllMocks()
})

/** Two poster-backed players, with the second optionally waiting for its source. */
async function mountGallery(delayed = false) {
	const fixture = await mountPage('/zoom/')
	const items = [query(fixture, '#video .amk-zoom'), query(fixture, '#video-minimal .amk-zoom')]
	fixture.replaceChildren(...items)
	Object.assign(fixture.style, { display: 'flex', gap: '20px' })
	for (const item of items) {
		item.dataset.gallery = 'previews'
		item.style.width = '240px'
	}

	const videos = items.map((item) => query(item, 'video', HTMLVideoElement))
	if (delayed) {
		delete videos[1]!.dataset.src
	}

	document.dispatchEvent(new Event('astro:page-load'))
	await waitForMedia(videos[0]!)
	if (!delayed) {
		await waitForMedia(videos[1]!)
	}

	await expect
		.poll(() => items.every((item) => item.querySelector('media-poster[data-visible]') !== null))
		.toBe(true)
	await Promise.all(
		items.map(async (item) => query(item, 'media-poster img', HTMLImageElement).decode()),
	)
	items[0]!.scrollIntoView({ block: 'center' })
	return { items, videos }
}

it.each([0, 1])(
	'starts live frames when gallery video %i first plays after lifting',
	async (index) => {
		const { items, videos } = await mountGallery()
		const item = items[index]!
		const video = videos[index]!
		const player = query(item, 'video-player')
		await openLightbox(items[0]!)
		const preview = query(item, '[data-amk-preview]')
		const bounds = preview.getBoundingClientRect()
		if (index === 1) {
			await userEvent.click(query(viewer(), '.amk-lightbox-next'))
		}

		await expect.poll(() => currentLayer().contains(player)).toBe(true)
		await userEvent.click(query(player, '.amk-bar media-play-button'))
		await expect.poll(() => video.currentTime).toBeGreaterThan(0.1)
		await expect.poll(() => item.querySelector('canvas')).not.toBeNull()
		const canvas = query(item, 'canvas', HTMLCanvasElement)
		const context = canvas.getContext('2d')!
		await expect.poll(() => context.getImageData(0, 0, 1, 1).data[3]).toBe(255)
		const draw = vi.spyOn(context, 'drawImage')
		await expect.poll(() => draw.mock.calls.length).toBeGreaterThan(1)
		expect(draw.mock.calls[0]![0]).toBe(video)
		expect(query(item, '[data-amk-preview]')).toBe(preview)
		expect(canvas.getBoundingClientRect().width).toBeCloseTo(bounds.width, 0)
		expect(canvas.getBoundingClientRect().height).toBeCloseTo(bounds.height, 0)

		video.pause()
		await frames()
		const pausedCount = draw.mock.calls.length
		await frames(6)
		expect(draw).toHaveBeenCalledTimes(pausedCount)
		video.currentTime += 1
		await expect.poll(() => draw.mock.calls.length).toBeGreaterThan(pausedCount)

		await closeLightbox(true)
		expect(preview.isConnected).toBe(false)
		expect(canvas.width).toBe(0)
		expect(canvas.height).toBe(0)
		const closedCount = draw.mock.calls.length
		video.currentTime += 1
		await frames(6)
		expect(draw).toHaveBeenCalledTimes(closedCount)

		await openLightbox(item)
		const reopened = query(item, 'canvas', HTMLCanvasElement)
		expect(reopened).not.toBe(canvas)
		expect(item.querySelectorAll('[data-amk-preview]')).toHaveLength(1)
		const redraw = vi.spyOn(reopened.getContext('2d')!, 'drawImage')
		await userEvent.click(query(player, '.amk-bar media-play-button'))
		await expect.poll(() => redraw.mock.calls.length).toBeGreaterThan(1)
	},
)

it('keeps a poster until delayed gallery video data can be drawn', async () => {
	const { items, videos } = await mountGallery(true)
	const item = items[1]!
	const video = videos[1]!
	const player = query(item, 'video-player')
	await openLightbox(items[0]!)
	const preview = query(item, '[data-amk-preview]')
	await userEvent.click(query(viewer(), '.amk-lightbox-next'))
	await expect.poll(() => currentLayer().contains(player)).toBe(true)
	expect(video.readyState).toBe(0)
	expect(item.querySelector('canvas')).toBeNull()

	video.src = '/media/loop.mp4'
	await waitForMedia(video)
	// Loading frames alone must not replace a poster the player still shows.
	await expect.poll(() => video.readyState).toBeGreaterThanOrEqual(2)
	expect(item.querySelector('canvas')).toBeNull()
	await userEvent.click(query(player, '.amk-bar media-play-button'))
	await expect.poll(() => item.querySelector('canvas')).not.toBeNull()
	const canvas = query(item, 'canvas', HTMLCanvasElement)
	const draw = vi.spyOn(canvas.getContext('2d')!, 'drawImage')
	await expect.poll(() => draw.mock.calls.length).toBeGreaterThan(1)
	expect(query(item, '[data-amk-preview]')).toBe(preview)
})

it('releases a waiting poster preview when the gallery closes before playback', async () => {
	const { items, videos } = await mountGallery(true)
	await openLightbox(items[0]!)
	const item = items[1]!
	const preview = query(item, '[data-amk-preview]')
	await closeLightbox(true)
	await expect.poll(() => preview.isConnected).toBe(false)
	const draw = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage')
	const video = videos[1]!
	video.src = '/media/loop.mp4'
	await waitForMedia(video)
	await userEvent.click(query(item, 'media-play-button'))
	await expect.poll(() => video.currentTime).toBeGreaterThan(0.1)
	expect(draw).not.toHaveBeenCalled()
	expect(item.querySelector('[data-amk-preview]')).toBeNull()
})
