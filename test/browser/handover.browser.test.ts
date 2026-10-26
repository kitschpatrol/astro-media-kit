import { afterEach, expect, it } from 'vitest'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	block,
	boxes,
	cleanUp,
	clickViewerAt,
	currentLayer,
	gallery,
	isLifted,
	item,
	middleOf,
	mount,
	query,
	setUpLightbox,
	transitionsDone,
	viewer,
} from './helpers'

/** Whether a point is inside where `layer` is drawn now. */
function isInsideLayer(layer: Element, point: { x: number; y: number }): boolean {
	const box = layer.getBoundingClientRect()
	return point.x >= box.x && point.x <= box.right && point.y >= box.y && point.y <= box.bottom
}

setUpLightbox()
afterEach(cleanUp)

it('opens another item while one is closing, letting the first finish gliding home', async () => {
	const fixture = mount(`${item(block('a'))}${item(block('b'))}`)
	const [a, b] = boxes(fixture)
	await openLightbox(a!)
	const layerA = currentLayer()
	const closing = closeLightbox()
	await expect.poll(() => getComputedStyle(layerA).translate).not.toBe('none')

	const opening = openLightbox(b!)
	expect(viewer().dataset.state).toBe('open')
	expect(isLifted(a!)).toBe(true)
	expect(isLifted(b!)).toBe(true)
	expect(layerA.closest('.amk-lightbox-slide')?.hasAttribute('data-ghost')).toBe(true)
	expect(activeSlideLabel()).toBe('1 of 1')
	await expect(opening).resolves.toBe(true)
	await closing
	await expect.poll(() => isLifted(a!)).toBe(false)
	expect(query(a!, '.subject').parentElement).toBe(a)
	expect(document.querySelectorAll('.amk-lightbox-slide')).toHaveLength(1)
	expect(viewer().open).toBe(true)
	expect(query(document, '.amk-lightbox-layer .subject').dataset.label).toBe('b')
})

it('opens the item clicked under the viewer while another opens or closes', async () => {
	const fixture = mount(gallery(['a', 'b', 'c']))
	const [a, b, c] = boxes(fixture)
	const openingA = openLightbox(a!)
	clickViewerAt(middleOf(b!))
	expect(isLifted(b!)).toBe(true)
	expect(activeSlideLabel()).toBe('2 of 3')
	expect(document.querySelectorAll('.amk-lightbox-slide[data-ghost]')).toHaveLength(1)
	await expect(openingA).resolves.toBe(true)
	await transitionsDone()
	// Back in the page, a lands next door to b, so it is lifted again
	await expect
		.poll(() => document.querySelectorAll('.amk-lightbox-slide[data-ghost]'))
		.toHaveLength(0)
	await expect.poll(() => isLifted(a!)).toBe(true)
	expect(viewer().dataset.state).toBe('open')

	const closing = closeLightbox()
	expect(isLifted(c!)).toBe(false)
	// Once the returning subject no longer covers c, a click there is for c
	await expect
		.poll(() => currentLayer().getBoundingClientRect().bottom)
		.toBeLessThan(middleOf(c!).y)
	clickViewerAt(middleOf(c!))
	expect(activeSlideLabel()).toBe('3 of 3')
	expect(isLifted(c!)).toBe(true)
	await closing
	await transitionsDone()
	await expect
		.poll(() => document.querySelectorAll('.amk-lightbox-slide[data-ghost]'))
		.toHaveLength(0)
	expect(viewer().open).toBe(true)
	expect(viewer().dataset.state).toBe('open')
	await closeLightbox()
	expect(viewer().open).toBe(false)
	for (const each of [a, b, c]) {
		expect(isLifted(each!)).toBe(false)
	}
})

it('reopens a returning subject that is clicked while it still covers another item', async () => {
	const fixture = mount(gallery(['a', 'b']))
	const [a, b] = boxes(fixture)
	await openLightbox(a!)
	const layer = currentLayer()
	const closing = closeLightbox()
	expect(isInsideLayer(layer, middleOf(b!))).toBe(true)
	clickViewerAt(middleOf(b!))
	expect(viewer().dataset.state).toBe('open')
	expect(activeSlideLabel()).toBe('1 of 2')
	await closing
	await transitionsDone()
	expect(viewer().open).toBe(true)
})
