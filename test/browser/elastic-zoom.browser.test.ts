import { afterEach, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import {
	cleanUp,
	currentLayer,
	currentStage,
	frames,
	middleOf,
	openZoomable,
	query,
	setUpLightbox,
	transitionsDone,
	viewer,
} from './helpers'
import { lift, pinch, pointer } from './touch'

setUpLightbox()
afterEach(async () => {
	await commands.emulateReducedMotion(false)
	await cleanUp()
})

async function open() {
	await openZoomable()
	return currentLayer().getBoundingClientRect()
}

it('follows a pinch below fit from the fitted image, dimming the viewer, and closes on release', async () => {
	const fitted = await open()
	const { x, y } = await pinch(0.4)
	const held = currentLayer().getBoundingClientRect()
	expect(held.width).toBeCloseTo(fitted.width * 0.4, 0)
	expect(held.x + held.width / 2).toBeCloseTo(x, 0)
	expect(held.y + held.height / 2).toBeCloseTo(y, 0)
	expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(true)
	expect(Number(viewer().style.getPropertyValue('--amk-lightbox-drag-opacity'))).toBeCloseTo(
		0.28,
		2,
	)
	// Nothing to reset on the way out
	expect(query(viewer(), '.amk-lightbox-zoom').inert).toBe(true)

	// The shrunken image goes wherever the fingers take it
	pointer('pointermove', 1, x - 20 + 300, y + 200)
	pointer('pointermove', 2, x + 20 + 300, y + 200)
	await frames()
	const moved = currentLayer().getBoundingClientRect()
	expect(moved.width).toBeCloseTo(fitted.width * 0.4, 0)
	expect(moved.x + moved.width / 2).toBeCloseTo(x + 300, 0)
	expect(moved.y + moved.height / 2).toBeCloseTo(y + 200, 0)

	lift()
	expect(viewer().dataset.state).toBe('closing')
	// Home from where it was let go, not from the fitted layout
	expect(currentLayer().getBoundingClientRect().width).toBeLessThan(fitted.width * 0.41)
	await expect.poll(() => viewer().open).toBe(false)
	expect(viewer().style.getPropertyValue('--amk-lightbox-drag-opacity')).toBe('')
})

it('brings the viewer back when a pinch to close grows past fit again', async () => {
	await open()
	const { x, y } = await pinch(0.4)
	pointer('pointermove', 1, x - 50, y)
	pointer('pointermove', 2, x + 50, y)
	await frames()
	expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)
	expect(viewer().style.getPropertyValue('--amk-lightbox-drag-opacity')).toBe('')
	lift()
	await transitionsDone()
	expect(viewer().open).toBe(true)
	expect(viewer().querySelector('[data-zoomed]')).toBeNull()
})

it('resists a pinch below fit once enlarged, and returns to the fitted geometry on release', async () => {
	const fitted = await open()
	await pinch(2)
	lift()
	await pinch(0.2)
	const held = currentLayer().getBoundingClientRect()
	expect(held.width).toBeLessThan(fitted.width)
	expect(held.width).toBeGreaterThan(fitted.width * 0.85)
	expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)
	lift()
	await transitionsDone()
	expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(fitted.toJSON())
	expect(viewer().querySelector('[data-zoomed]')).toBeNull()
	expect(viewer().open).toBe(true)
})

it('scales the laid-out frame while held and lays it out again on release', async () => {
	const fitted = await open()
	await pinch(2)
	const frame = query(viewer(), '.amk-lightbox-slide:not([inert]) .amk-lightbox-frame')
	expect(frame.offsetWidth).toBeCloseTo(fitted.width, 0)
	expect(Number(getComputedStyle(frame).scale)).toBeCloseTo(2, 2)
	lift()
	expect(frame.offsetWidth).toBeCloseTo(fitted.width * 2, 0)
	expect(getComputedStyle(frame).scale).toBe('none')
})

it('crosses fit in both directions without releasing or changing the focal point', async () => {
	const fitted = await open()
	const { x, y } = await pinch(0.4)
	for (const { max, min, scale } of [
		{ max: 1.51, min: 1.49, scale: 1.5 },
		{ max: 1, min: 0.85, scale: 0.6 },
		{ max: 2.01, min: 1.99, scale: 2 },
	]) {
		pointer('pointermove', 1, x - 50 * scale, y)
		pointer('pointermove', 2, x + 50 * scale, y)
		await frames()
		const box = currentLayer().getBoundingClientRect()
		expect(box.x + box.width / 2).toBeCloseTo(x, 0)
		expect(box.y + box.height / 2).toBeCloseTo(y, 0)
		expect(box.width).toBeGreaterThan(fitted.width * min)
		expect(box.width).toBeLessThan(fitted.width * max)
	}

	lift()
})

it('resists zoom past the upper limit and settles around the same focal point', async () => {
	const fitted = await open()
	const { x, y } = await pinch(12)
	const held = currentLayer().getBoundingClientRect()
	expect(held.width).toBeGreaterThan(fitted.width * 8)
	expect(held.width).toBeLessThan(fitted.width * 8.8)
	lift()
	await transitionsDone()
	const settled = currentLayer().getBoundingClientRect()
	expect(settled.width).toBeCloseTo(fitted.width * 8, 0)
	expect(settled.x + settled.width / 2).toBeCloseTo(x, 0)
	expect(settled.y + settled.height / 2).toBeCloseTo(y, 0)
})

it.each([0.4, 12])(
	'keeps scale continuous when fingers change at a resisted scale of %s',
	async (scale) => {
		await open()
		const { x, y } = await pinch(scale)
		const held = currentLayer().getBoundingClientRect()
		pointer('pointerup', 2, x + 50 * scale, y)
		pointer('pointerdown', 2, x + 50 * scale, y)
		pointer('pointermove', 1, x - 50 * scale, y)
		pointer('pointermove', 2, x + 50 * scale, y)
		await frames()
		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(held.width, 0)
		expect(currentLayer().getBoundingClientRect().x).toBeCloseTo(held.x, 0)
		lift()
	},
)

it.each([0.2, 6])(
	'catches the return from scale %s without shifting the displayed image',
	async (scale) => {
		const fitted = await open()
		await pinch(2)
		lift()
		const { x, y } = await pinch(scale)
		const held = currentLayer().getBoundingClientRect()
		lift()
		// Part of the way back to its limit
		await frames(3)
		const before = currentLayer().getBoundingClientRect()
		expect(Math.abs(before.width - held.width)).toBeGreaterThan(1)
		expect(Math.abs(before.width - fitted.width * (scale < 1 ? 1 : 8))).toBeGreaterThan(1)
		pointer('pointerdown', 1, x - 50, y)
		pointer('pointerdown', 2, x + 50, y)
		pointer('pointermove', 1, x - 50, y)
		pointer('pointermove', 2, x + 50, y)
		await frames()
		const caught = currentLayer().getBoundingClientRect()
		expect(caught.width).toBeCloseTo(before.width, 0)
		expect(caught.x).toBeCloseTo(before.x, 0)
		expect(caught.y).toBeCloseTo(before.y, 0)
		lift()
	},
)

it('restores fit after cancellation without animating when reduced motion is requested', async () => {
	const fitted = await open()
	await commands.emulateReducedMotion(true)
	await pinch(0.4)
	const { x, y } = middleOf(currentStage())
	pointer('pointercancel', 1, x, y)
	lift()
	await frames()
	expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(fitted.toJSON())
	expect(currentLayer().getAnimations()).toHaveLength(0)
})
