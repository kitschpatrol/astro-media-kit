import { afterEach, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	boxes,
	cleanUp,
	currentLayer,
	currentStage,
	frames,
	middleOf,
	mount,
	setUpLightbox,
	transitionsDone,
	viewer,
	zoomable,
} from './helpers'
import { lift, pinch, pointer } from './touch'

setUpLightbox()
afterEach(async () => {
	await commands.emulateReducedMotion(false)
	await cleanUp()
})

async function open() {
	await openLightbox(boxes(mount(zoomable('fit')))[0]!)
	return currentLayer().getBoundingClientRect()
}

it('shrinks below fit with resistance and returns to the fitted geometry on release', async () => {
	const fitted = await open()
	await pinch(0.4)
	const held = currentLayer().getBoundingClientRect()
	expect(held.width).toBeLessThan(fitted.width)
	expect(held.width).toBeGreaterThan(fitted.width * 0.85)
	lift()
	await transitionsDone()
	expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(fitted.toJSON())
	expect(viewer().querySelector('[data-zoomed]')).toBeNull()
	expect(viewer().open).toBe(true)
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

it.each([0.4, 12])(
	'catches the return from scale %s without shifting the displayed image',
	async (scale) => {
		await open()
		const { x, y } = await pinch(scale)
		lift()
		const animations = currentLayer().getAnimations()
		for (const animation of animations) {
			animation.pause()
			animation.currentTime = Number(animation.effect!.getTiming().duration) / 2
		}

		await frames()
		const before = currentLayer().getBoundingClientRect()
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
