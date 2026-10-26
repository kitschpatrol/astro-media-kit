// Text links that open media the page doesn't show: the media is instantiated
// from the link's template as the link is used, grows out of the link, and goes
// away again when the viewer closes.

import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import '../../src/components/internal/videojs-ui'
import '../../src/components/internal/videojs-media'
import '../../src/components/internal/amk-video.css'
import {
	activeSlideLabel,
	cleanUp,
	clickViewerAt,
	close,
	currentLayer,
	isLifted,
	liftDone,
	mountPage,
	query,
	setUpLightbox,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

/** The fixture page: a gallery image, then four links in a paragraph. */
async function mountLinks(): Promise<{
	fixture: HTMLElement
	photo: HTMLAnchorElement
	second: HTMLAnchorElement
	tile: HTMLAnchorElement
	video: HTMLAnchorElement
}> {
	const fixture = await mountPage('/zoom-link/')
	const [photo, video, tile, second] = fixture.querySelectorAll<HTMLAnchorElement>(
		':scope #prose a.amk-zoom-link',
	)
	const image = query(fixture, '#gallery img', HTMLImageElement)
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true)
	return { fixture, photo: photo!, second: second!, tile: tile!, video: video! }
}

/** The current slide's frame, which the layer fills once the lift has settled. */
function currentFrame(): DOMRect {
	return query(
		document,
		'.amk-lightbox-slide:not([inert]) .amk-lightbox-frame',
	).getBoundingClientRect()
}

/** The media in the link's template, which isn't a descendant of the link. */
function templated(link: HTMLAnchorElement): DocumentFragment {
	return query(link, 'template', HTMLTemplateElement).content
}

/** The keyframes of the transition of `property` running on `layer`. */
function keyframesOf(layer: HTMLElement, property: string): Keyframe[] {
	const transition = layer
		.getAnimations()
		.find(
			(animation): animation is CSSTransition =>
				animation instanceof CSSTransition && animation.transitionProperty === property,
		)
	const { effect } = transition ?? {}
	if (!(effect instanceof KeyframeEffect)) {
		throw new TypeError(`No ${property} transition is running`)
	}

	return effect.getKeyframes()
}

/** A keyframe's value of `property` as a number, with any `px` unit dropped. */
function numberOf(keyframe: Keyframe | undefined, property: string): number {
	const value = String(keyframe?.[property] ?? '')
	return Number(value.endsWith('px') ? value.slice(0, -2) : value)
}

it('keeps its place in the line as a link, with the media in an inert template', async () => {
	const { photo } = await mountLinks()
	expect(getComputedStyle(photo).display).toBe('inline')
	expect(photo.href).toContain('/_astro/')
	expect(photo.querySelector('img')).toBeNull()
	expect(templated(photo).querySelector('img')).not.toBeNull()
})

it('opens the image from the link, and takes it away again for a fresh one next time', async () => {
	const { photo } = await mountLinks()

	await userEvent.click(photo)

	await expect.poll(() => viewer().dataset.state).toBe('open')
	expect(isLifted(photo)).toBe(true)
	const image = query(currentLayer(), 'img', HTMLImageElement)
	expect(image.alt).toBe('a photo')
	await liftDone()
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true)
	const frame = currentFrame()
	expect(frame.width / frame.height).toBeCloseTo(image.naturalWidth / image.naturalHeight, 1)
	expect(viewer().dataset.lone).toBeUndefined()

	await close()

	expect(isLifted(photo)).toBe(false)
	expect(image.isConnected).toBe(false)
	expect(document.querySelector('.amk-lightbox img')).toBeNull()
	expect(templated(photo).querySelector('img')).not.toBeNull()

	await userEvent.click(photo)

	await expect.poll(() => viewer().dataset.state).toBe('open')
	expect(query(currentLayer(), 'img')).not.toBe(image)
})

it('grows the image out of the link, and shrinks it back into it', async () => {
	const { photo } = await mountLinks()
	const slow = document.createElement('style')
	slow.textContent = '.amk-lightbox { --amk-lightbox-duration: 1s; }'
	document.head.append(slow)
	try {
		const link = photo.getBoundingClientRect()
		const linkCenter = { x: link.x + link.width / 2, y: link.y + link.height / 2 }

		await userEvent.click(photo)

		await expect.poll(() => viewer().dataset.state).toBe('open')
		const layer = currentLayer()
		await expect.poll(() => layer.getAnimations().length).toBeGreaterThan(0)
		const frame = currentFrame()
		expect(numberOf(keyframesOf(layer, 'scale')[0], 'scale')).toBe(0.5)
		const [x = '', y = ''] = String(keyframesOf(layer, 'translate')[0]?.translate).split(' ', 2)
		expect(frame.x + numberOf({ x }, 'x') + frame.width / 4).toBeCloseTo(linkCenter.x, 0)
		expect(frame.y + numberOf({ y }, 'y') + frame.height / 4).toBeCloseTo(linkCenter.y, 0)
		expect(numberOf(keyframesOf(layer, 'opacity')[0], 'opacity')).toBe(0)
		await liftDone(3000)

		clickViewerAt({ x: 5, y: 5 })

		await expect.poll(() => viewer().dataset.state).toBe('closing')
		expect(numberOf(keyframesOf(layer, 'scale').at(-1), 'scale')).toBe(0.5)
		expect(numberOf(keyframesOf(layer, 'opacity').at(-1), 'opacity')).toBe(0)
		await expect.poll(() => viewer().open, { timeout: 3000 }).toBe(false)
	} finally {
		slow.remove()
	}
})

it('plays a video from the link in a player of its own, with its controls floated', async () => {
	const { video } = await mountLinks()

	await userEvent.click(video)

	await expect.poll(() => viewer().dataset.state).toBe('open')
	const player = query(currentLayer(), 'video-player')
	await customElements.whenDefined('video-player')
	await expect.poll(() => query(player, 'video').getAttribute('src')).toBe('/media/loop.mp4')
	const controls = query(player, '.amk-controls')
	await expect.poll(() => controls.matches(':popover-open')).toBe(true)
	await liftDone(3000)

	await userEvent.click(query(player, '[data-zoom-open]'))

	await expect.poll(() => viewer().open).toBe(false)
	expect(player.isConnected).toBe(false)
	expect(isLifted(video)).toBe(false)
	expect(templated(video).querySelector('video-player')).not.toBeNull()
})

it('joins the gallery of the items in the page, and leaves focus on the link', async () => {
	const { fixture, photo } = await mountLinks()

	await userEvent.click(query(fixture, '#gallery .amk-zoom'))

	await expect.poll(() => viewer().dataset.state).toBe('open')
	expect(activeSlideLabel()).toBe('1 of 3')

	await userEvent.keyboard('{ArrowRight}')

	await expect.poll(activeSlideLabel).toBe('2 of 3')
	expect(isLifted(photo)).toBe(true)
	expect(query(currentLayer(), 'img', HTMLImageElement).alt).toBe('a photo')

	await userEvent.keyboard('{Escape}')

	await expect.poll(() => viewer().open).toBe(false)
	expect(isLifted(photo)).toBe(false)
	expect(document.activeElement).toBe(photo)
})

it('opens from the keyboard, as the link it is', async () => {
	const { tile } = await mountLinks()
	tile.focus()

	await userEvent.keyboard('{Enter}')

	await expect.poll(() => viewer().dataset.state).toBe('open')
	expect(query(currentLayer(), 'img', HTMLImageElement).alt).toBe('A tile')
	expect(viewer().dataset.lone).toBe('')
})

it('warms the image on hover, without showing anything', async () => {
	const { second } = await mountLinks()
	// An image no other test has loaded, so that its request is a new one
	const before = performance.getEntriesByType('resource').length

	await userEvent.hover(second)

	await expect
		.poll(() =>
			performance
				.getEntriesByType('resource')
				.slice(before)
				.some((entry) => entry.name.includes('penguin2')),
		)
		.toBe(true)
	expect(document.querySelector('.amk-lightbox img')).toBeNull()
	expect(isLifted(second)).toBe(false)
})
