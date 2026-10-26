// The embedded carousel against the markup the component renders, from the
// fixture that `test/carousel.test.ts` also builds.

import { afterEach, expect, it } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { disposeCarousels, setUpCarousels } from '../../src/components/internal/carousel/carousel'
import { activeSlideLabel, cleanUp, mountPage, query, setUpLightbox, viewer } from './helpers'
import '../../src/components/internal/carousel/carousel.css'

setUpLightbox()
afterEach(async () => {
	disposeCarousels()
	await cleanUp()
})

async function mountCarousel(id = 'captioned'): Promise<{
	carousel: HTMLElement
	track: HTMLElement
}> {
	const fixture = await mountPage('/carousel/')
	setUpCarousels()
	const carousel = query(fixture, `#${id} .amk-carousel`)
	// Lazy images out of view, or hidden by a theme, never load
	const image = query(carousel, '.amk-carousel-slide img', HTMLImageElement)
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true)
	return { carousel, track: query(carousel, '.amk-carousel-track') }
}

/** The index of the slide the track rests on. */
function slideAt(track: HTMLElement): number {
	return Math.round(Math.abs(track.scrollLeft) / track.clientWidth)
}

function currentDot(carousel: HTMLElement): string {
	return query(carousel, '.amk-carousel-dot[aria-current="true"]').getAttribute('aria-label') ?? ''
}

it('lays slides out one per track width, with captions shown on request', async () => {
	const { carousel, track } = await mountCarousel()
	const slides = [...track.querySelectorAll<HTMLElement>('.amk-carousel-slide')]
	expect(slides.map((slide) => slide.getBoundingClientRect().width)).toEqual([400, 400, 400])
	expect(track.scrollWidth).toBe(1200)
	expect(getComputedStyle(query(slides[0]!, 'figcaption')).display).not.toBe('none')
	expect(getComputedStyle(query(carousel, '.amk-carousel-previous')).opacity).toBe('0.3')
})

it('gives the dots touch-sized hit zones that meet', async () => {
	const { carousel } = await mountCarousel()
	const boxes = Array.from(carousel.querySelectorAll('.amk-carousel-dot'), (dot) =>
		dot.getBoundingClientRect(),
	)
	expect(boxes).toHaveLength(3)
	for (const box of boxes) {
		expect(box.width).toBeGreaterThanOrEqual(24)
		expect(box.height).toBeGreaterThanOrEqual(24)
	}

	expect(boxes[1]!.left).toBe(boxes[0]!.right)
	expect(boxes[2]!.left).toBe(boxes[1]!.right)
})

it('steps with the buttons and the dots, and says where it is', async () => {
	const { carousel, track } = await mountCarousel()
	const next = query(carousel, '.amk-carousel-next')
	const previous = query(carousel, '.amk-carousel-previous')

	await userEvent.click(next)
	await expect.poll(() => slideAt(track)).toBe(1)
	await expect.poll(() => currentDot(carousel)).toBe('Slide 2')
	expect(previous.getAttribute('aria-disabled')).toBe('false')

	await userEvent.click(query(carousel, '.amk-carousel-dot[aria-label="Slide 3"]'))
	await expect.poll(() => slideAt(track)).toBe(2)
	await expect.poll(() => next.getAttribute('aria-disabled')).toBe('true')

	await userEvent.click(previous)
	await expect.poll(() => slideAt(track)).toBe(1)
})

it('steps with the arrow keys, Home and End', async () => {
	const { carousel, track } = await mountCarousel()
	query(carousel, '.amk-carousel-next').focus()

	await userEvent.keyboard('{ArrowRight}')
	await expect.poll(() => slideAt(track)).toBe(1)
	await userEvent.keyboard('{End}')
	await expect.poll(() => slideAt(track)).toBe(2)
	await userEvent.keyboard('{ArrowLeft}')
	await expect.poll(() => slideAt(track)).toBe(1)
	await userEvent.keyboard('{Home}')
	await expect.poll(() => slideAt(track)).toBe(0)
})

it('drags with the mouse without opening the lightbox, and opens it on a click', async () => {
	const { track } = await mountCarousel()
	const box = track.getBoundingClientRect()
	const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

	await commands.mouseDown(middle.x, middle.y)
	await commands.mouseUp(middle.x - 200, middle.y)
	await expect.poll(() => slideAt(track)).toBe(1)
	await new Promise((resolve) => {
		setTimeout(resolve, 200)
	})
	expect(document.querySelector('dialog.amk-lightbox[open]')).toBeNull()

	await userEvent.click(query(track, '.amk-carousel-slide:nth-child(2) .amk-zoom'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	expect(activeSlideLabel()).toBe('2 of 3')
})

it('clips the slides at its edges as the track is pulled past an end', async () => {
	const { carousel, track } = await mountCarousel()
	const box = query(carousel, '.amk-carousel-viewport').getBoundingClientRect()
	const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

	await commands.mouseDown(middle.x, middle.y)
	await commands.mouseMove(middle.x + 20, middle.y)
	await commands.mouseMove(middle.x + 150, middle.y)

	await expect.poll(() => track.getBoundingClientRect().x).toBeGreaterThan(box.x + 20)
	const beside = document.elementFromPoint(box.right + 20, middle.y)
	expect(beside !== null && carousel.contains(beside)).toBe(false)
	await commands.mouseUp()
})

it('hides captions unless asked, leaving them to the lightbox', async () => {
	const { track } = await mountCarousel('quiet')
	const caption = query(track, 'figcaption')
	expect(getComputedStyle(caption).display).toBe('none')

	await userEvent.click(query(track, '.amk-zoom'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	expect(query(viewer(), '.amk-lightbox-caption').textContent).toContain('stays hidden')
})

it('returns from the lightbox onto the slide that was showing there', async () => {
	const { carousel, track } = await mountCarousel()

	await userEvent.click(query(track, '.amk-zoom'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await userEvent.keyboard('{ArrowRight}')
	await expect.poll(activeSlideLabel).toBe('2 of 3')
	await userEvent.keyboard('{Escape}')
	await expect.poll(() => viewer().open).toBe(false)

	await expect.poll(() => slideAt(track)).toBe(1)
	await expect.poll(() => currentDot(carousel)).toBe('Slide 2')
})
