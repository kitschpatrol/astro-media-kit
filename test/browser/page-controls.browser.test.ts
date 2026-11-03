import { afterEach, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	block,
	boxes,
	cleanUp,
	currentLayer,
	frames,
	gallery,
	isLifted,
	item,
	mount,
	query,
	setUpLightbox,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

function opacity(element: HTMLElement): number {
	return Number(getComputedStyle(element).getPropertyValue('--amk-page-controls-opacity'))
}

function fade(element: HTMLElement): CSSTransition | undefined {
	return element
		.getAnimations()
		.find(
			(animation): animation is CSSTransition =>
				animation instanceof CSSTransition &&
				animation.transitionProperty === '--amk-page-controls-opacity',
		)
}

it('fades only the active page item while lifted neighbors keep their controls', async () => {
	const fixture = mount(gallery(['first', 'second', 'third', 'fourth']))
	const [first, second, third, fourth] = boxes(fixture)
	await frames()
	const opening = openLightbox(first!)
	expect(Object.hasOwn(first!.dataset, 'zoomActive')).toBe(true)
	for (const other of [second!, third!, fourth!]) {
		expect(Object.hasOwn(other.dataset, 'zoomActive')).toBe(false)
		expect(opacity(other)).toBe(1)
	}

	expect(fade(first!)).toBeDefined()
	await opening
	await expect.poll(() => opacity(first!)).toBe(0)
	expect(isLifted(second!)).toBe(true)
	expect(isLifted(fourth!)).toBe(false)
	expect(opacity(second!)).toBe(1)
	expect(opacity(fourth!)).toBe(1)
})

it('starts the old and new page control fades together when the active slide changes', async () => {
	const fixture = mount(gallery(['first', 'second', 'third']))
	const [first, second, third] = boxes(fixture)
	await openLightbox(first!)
	await expect.poll(() => opacity(first!)).toBe(0)
	query(viewer(), '.amk-lightbox-next').click()
	await expect.poll(() => Object.hasOwn(second!.dataset, 'zoomActive')).toBe(true)
	expect(Object.hasOwn(first!.dataset, 'zoomActive')).toBe(false)
	const returning = fade(first!)!
	const leaving = fade(second!)!
	expect(returning).toBeDefined()
	expect(leaving).toBeDefined()
	expect(returning.startTime).toBe(leaving.startTime)
	returning.pause()
	leaving.pause()
	returning.currentTime = 150
	leaving.currentTime = 150
	expect(opacity(first!)).toBeGreaterThan(0)
	expect(opacity(second!)).toBeGreaterThan(0)
	expect(opacity(first!) + opacity(second!)).toBeCloseTo(1, 3)
	expect(opacity(third!)).toBe(1)
	returning.finish()
	leaving.finish()
})

it('keeps the active page controls hidden until the viewer has closed', async () => {
	const fixture = mount(gallery(['first', 'second']))
	const [first, second] = boxes(fixture)
	await openLightbox(first!)
	await expect.poll(() => opacity(first!)).toBe(0)
	const closing = closeLightbox()
	const animations = currentLayer().getAnimations()
	for (const animation of animations) {
		animation.pause()
	}

	expect(viewer().open).toBe(true)
	expect(Object.hasOwn(first!.dataset, 'zoomActive')).toBe(true)
	expect(opacity(first!)).toBe(0)
	expect(opacity(second!)).toBe(1)
	for (const animation of animations) {
		animation.finish()
	}

	await closing
	expect(viewer().open).toBe(false)
	expect(Object.hasOwn(first!.dataset, 'zoomActive')).toBe(false)
	await expect.poll(() => opacity(first!)).toBe(1)
})

it('transfers active ownership during an interrupted close without affecting other scoped groups', async () => {
	const fixture = mount(`
		<section class="post">${item(block('a'), 'data-gallery="g" data-scope=".post"')}
			${item(block('b'), 'data-gallery="g" data-scope=".post"')}</section>
		<section class="post">${item(block('c'), 'data-gallery="g" data-scope=".post"')}</section>`)
	const [first, second, other] = boxes(fixture)
	await openLightbox(first!)
	await expect.poll(() => opacity(first!)).toBe(0)
	const closing = closeLightbox()
	const opening = openLightbox(other!)
	expect(Object.hasOwn(first!.dataset, 'zoomActive')).toBe(false)
	expect(Object.hasOwn(second!.dataset, 'zoomActive')).toBe(false)
	expect(Object.hasOwn(other!.dataset, 'zoomActive')).toBe(true)
	await Promise.all([closing, opening])
	await expect.poll(() => opacity(first!)).toBe(1)
	await expect.poll(() => opacity(other!)).toBe(0)
	await closeLightbox(true)
	expect(fixture.querySelector('[data-zoom-active]')).toBeNull()
})

it('cleans active state when the page is replaced or the viewer closes externally', async () => {
	const fixture = mount(gallery(['first', 'second']))
	const [first, second] = boxes(fixture)
	await openLightbox(first!)
	document.dispatchEvent(new Event('astro:before-swap'))
	expect(Object.hasOwn(first!.dataset, 'zoomActive')).toBe(false)
	await openLightbox(second!)
	viewer().close()
	await expect.poll(() => Object.hasOwn(second!.dataset, 'zoomActive')).toBe(false)
	await openLightbox(first!)
	first!.remove()
	await closeLightbox(true)
	expect(Object.hasOwn(first!.dataset, 'zoomActive')).toBe(false)
})

it('cancels page control fades immediately when reduced motion is enabled', async () => {
	const fixture = mount(gallery(['first', 'second']))
	const [first, second] = boxes(fixture)
	fixture.style.setProperty('--amk-lightbox-open-fade-duration', '2s')
	await frames()
	const opening = openLightbox(first!)
	expect(fade(first!)).toBeDefined()
	await commands.emulateReducedMotion(true)
	try {
		await opening
		expect(opacity(first!)).toBe(0)
		expect(opacity(second!)).toBe(1)
		expect(fade(first!)).toBeUndefined()
		await closeLightbox()
		expect(opacity(first!)).toBe(1)
		expect(fade(first!)).toBeUndefined()
	} finally {
		await commands.emulateReducedMotion(false)
	}
})
