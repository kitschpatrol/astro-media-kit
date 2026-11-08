// Sound across a gallery: only the active item is heard, the rest fade away
// and come back at the level they had when the gallery opened, or at one set
// since in the viewer.

import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	boxes,
	cleanUp,
	mount,
	playerItem,
	query,
	setUpLightbox,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

/** A playing, muted video player item in the gallery, at the given volume. */
function videoItem(volume: number, wrapped = true): string {
	const video = `<video muted autoplay loop playsinline width="1280" height="720" style="width: 100%; height: auto">
		<source src="/media/loop.mp4" type="video/mp4" />
		<source src="/media/loop.webm" type="video/webm" />
	</video>`
	return playerItem(
		wrapped ? `<div class="player" style="width: 240px">${video}</div>` : video,
		`data-gallery="sound" data-volume="${String(volume)}"`,
	)
}

async function mountGallery(
	wrapped = true,
): Promise<{ fixture: HTMLElement; videos: HTMLVideoElement[] }> {
	const fixture = mount(videoItem(0.8, wrapped) + videoItem(0.5, wrapped))
	const videos = [...fixture.querySelectorAll('video')]
	for (const [index, video] of videos.entries()) {
		video.volume = Number(boxes(fixture)[index]!.dataset.volume)
		await video.play()
	}

	await expect.poll(() => videos.every((video) => !video.paused)).toBe(true)
	return { fixture, videos }
}

it.each([true, false])(
	'fades only inactive media through gallery navigation, wrapped=%s',
	async (wrapped) => {
		const { fixture, videos } = await mountGallery(wrapped)
		const [first, second] = videos
		await openLightbox(boxes(fixture)[0]!)

		await expect.poll(() => second!.volume).toBe(0)
		expect(first!.volume).toBeCloseTo(0.8, 5)
		expect(second!.muted).toBe(true)

		await userEvent.click(query(document, '.amk-lightbox-next'))
		await expect.poll(activeSlideLabel).toBe('2 of 2')
		await expect.poll(() => second!.volume).toBeCloseTo(0.5, 5)
		await expect.poll(() => first!.volume).toBe(0)

		await closeLightbox()
		await expect.poll(() => first!.volume).toBeCloseTo(0.8, 5)
		expect(second!.volume).toBeCloseTo(0.5, 5)
	},
)

it.each([true, false])(
	'keeps volume changes across navigation and close, wrapped=%s',
	async (wrapped) => {
		const { fixture, videos } = await mountGallery(wrapped)
		const [first, second] = videos
		await openLightbox(boxes(fixture)[0]!)
		await expect.poll(() => second!.volume).toBe(0)

		await userEvent.click(query(document, '.amk-lightbox-next'))
		await expect.poll(() => second!.volume).toBeCloseTo(0.5, 5)
		second!.volume = 0.2
		await userEvent.click(query(document, '.amk-lightbox-previous'))
		await expect.poll(activeSlideLabel).toBe('1 of 2')
		await expect.poll(() => second!.volume).toBe(0)
		await userEvent.click(query(document, '.amk-lightbox-next'))
		await expect.poll(() => second!.volume).toBeCloseTo(0.2, 5)
		expect(first!.volume).toBe(0)

		await closeLightbox(true)
		await expect.poll(() => first!.volume).toBeCloseTo(0.8, 5)
		await expect.poll(() => second!.volume).toBeCloseTo(0.2, 5)
	},
)

it('leaves media that is not playing alone', async () => {
	const fixture = mount(videoItem(0.8) + videoItem(0.5).replace(' autoplay', ''))
	const [playing, paused] = fixture.querySelectorAll('video')
	playing!.volume = 0.8
	paused!.volume = 0.5
	await playing!.play()
	await expect.poll(() => playing!.paused).toBe(false)
	expect(paused!.paused).toBe(true)
	await openLightbox(boxes(fixture)[0]!)
	await new Promise((resolve) => {
		setTimeout(resolve, 300)
	})
	expect(paused!.volume).toBeCloseTo(0.5, 5)

	await userEvent.click(query(document, '.amk-lightbox-next'))
	await expect.poll(activeSlideLabel).toBe('2 of 2')
	await expect.poll(() => playing!.volume).toBe(0)
	expect(paused!.volume).toBeCloseTo(0.5, 5)
	await closeLightbox()
	await expect.poll(() => playing!.volume).toBeCloseTo(0.8, 5)
})

it('leaves a lone item its sound', async () => {
	const fixture = mount(videoItem(0.6))
	const video = query(fixture, 'video', HTMLVideoElement)
	video.volume = 0.6
	await openLightbox(boxes(fixture)[0]!)
	await new Promise((resolve) => {
		setTimeout(resolve, 300)
	})
	expect(video.volume).toBeCloseTo(0.6, 5)
	await closeLightbox()
	expect(video.volume).toBeCloseTo(0.6, 5)
})
