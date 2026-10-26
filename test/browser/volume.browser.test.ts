// Sound across a gallery: only the active item is heard, the rest fade away
// and come back at the level they had when the gallery opened.

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
function videoItem(volume: number): string {
	return playerItem(
		`<div class="player" style="width: 240px">
			<video muted autoplay loop playsinline width="1280" height="720" style="width: 100%; height: auto">
				<source src="/media/loop.webm" type="video/webm" />
				<source src="/media/loop.mp4" type="video/mp4" />
			</video>
		</div>`,
		`data-gallery="sound" data-volume="${String(volume)}"`,
	)
}

function mountGallery(): { fixture: HTMLElement; videos: HTMLVideoElement[] } {
	const fixture = mount(videoItem(0.8) + videoItem(0.5))
	const videos = [...fixture.querySelectorAll('video')]
	for (const [index, video] of videos.entries()) {
		video.volume = Number(boxes(fixture)[index]!.dataset.volume)
	}

	return { fixture, videos }
}

it('fades the other items away as the gallery opens, and back as the carousel reaches them', async () => {
	const { fixture, videos } = mountGallery()
	const [first, second] = videos
	await openLightbox(boxes(fixture)[0]!)

	await expect.poll(() => second!.volume).toBe(0)
	expect(first!.volume).toBe(0.8)
	expect(second!.muted).toBe(true)

	await userEvent.click(query(document, '.amk-lightbox-next'))
	await expect.poll(activeSlideLabel).toBe('2 of 2')
	await expect.poll(() => second!.volume).toBe(0.5)
	await expect.poll(() => first!.volume).toBe(0)

	await closeLightbox()
	await expect.poll(() => first!.volume).toBe(0.8)
	expect(second!.volume).toBe(0.5)
})

it('restores the level the gallery opened with, not a level set meanwhile', async () => {
	const { fixture, videos } = mountGallery()
	const [first, second] = videos
	await openLightbox(boxes(fixture)[0]!)
	await expect.poll(() => second!.volume).toBe(0)

	await userEvent.click(query(document, '.amk-lightbox-next'))
	await expect.poll(() => second!.volume).toBe(0.5)
	second!.volume = 0.2
	await userEvent.click(query(document, '.amk-lightbox-previous'))
	await expect.poll(activeSlideLabel).toBe('1 of 2')
	await expect.poll(() => second!.volume).toBe(0)
	await userEvent.click(query(document, '.amk-lightbox-next'))
	await expect.poll(() => second!.volume).toBe(0.5)
	expect(first!.volume).toBe(0)

	await closeLightbox(true)
	await expect.poll(() => first!.volume).toBe(0.8)
	await expect.poll(() => second!.volume).toBe(0.5)
})

it('leaves a lone item its sound', async () => {
	const fixture = mount(videoItem(0.6))
	const video = query(fixture, 'video', HTMLVideoElement)
	video.volume = 0.6
	await openLightbox(boxes(fixture)[0]!)
	await new Promise((resolve) => {
		setTimeout(resolve, 300)
	})
	expect(video.volume).toBe(0.6)
	await closeLightbox()
	expect(video.volume).toBe(0.6)
})
