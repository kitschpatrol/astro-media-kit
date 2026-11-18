import { afterEach, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import { closeLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	cleanUp,
	currentLayer,
	currentStage,
	frames,
	middleOf,
	openZoomable,
	settle,
	setUpLightbox,
	viewer,
} from './helpers'
import { lift, pinch, pointer } from './touch'

setUpLightbox()
afterEach(async () => {
	viewer().style.removeProperty('--amk-lightbox-pan-padding')
	await commands.touchContacts([])
	await commands.emulateReducedMotion(false)
	await cleanUp()
})

async function drag(fingers = 1) {
	const { x, y } = middleOf(currentStage())
	pointer('pointerdown', 1, x - 50, y)
	if (fingers === 2) {
		pointer('pointerdown', 2, x + 50, y)
	}

	for (let i = 1; i <= 4; i++) {
		pointer('pointermove', 1, x - 50 - i * 25, y - i * 15)
		if (fingers === 2) {
			pointer('pointermove', 2, x + 50 - i * 25, y - i * 15)
		}

		await frames()
	}
}

it.each([
	{ x: 0, y: 0 },
	{ x: 1, y: 0 },
	{ x: 0, y: 1 },
	{ x: 1, y: 1 },
])('keeps the corner at $x, $y under a pinch without centering the image', async (anchor) => {
	await openZoomable()
	const before = currentLayer().getBoundingClientRect()
	const point = { x: before.x + before.width * anchor.x, y: before.y + before.height * anchor.y }
	pointer('pointerdown', 1, point.x - 20, point.y)
	pointer('pointerdown', 2, point.x + 20, point.y)
	pointer('pointermove', 1, point.x - 30, point.y)
	pointer('pointermove', 2, point.x + 30, point.y)
	await frames()
	lift()
	const after = currentLayer().getBoundingClientRect()
	expect(after.width).toBeCloseTo(before.width * 1.5, 0)
	expect(after.x + after.width * anchor.x).toBeCloseTo(point.x, 0)
	expect(after.y + after.height * anchor.y).toBeCloseTo(point.y, 0)
})

it('follows a single finger as it moves, without waiting for a frame', async () => {
	await openZoomable()
	await pinch(3)
	lift()
	const { x, y } = middleOf(currentStage())
	const before = currentLayer().getBoundingClientRect()
	pointer('pointerdown', 1, x, y)
	pointer('pointermove', 1, x - 40, y - 20)
	// Read in the same task as the move
	const moved = currentLayer().getBoundingClientRect()
	expect(moved.x).toBeCloseTo(before.x - 40, 0)
	expect(moved.y).toBeCloseTo(before.y - 20, 0)
	pointer('pointermove', 1, x - 90, y - 50)
	expect(currentLayer().getBoundingClientRect().x).toBeCloseTo(before.x - 90, 0)
	lift()
})

it.each([1, 2])('coasts after a %i-finger pan and stays on the same slide', async (fingers) => {
	await openZoomable()
	await pinch(3)
	lift()
	await drag(fingers)
	const released = currentLayer().getBoundingClientRect()
	lift()
	await expect.poll(() => currentLayer().getBoundingClientRect().x).toBeLessThan(released.x - 10)
	await expect.poll(() => currentLayer().getBoundingClientRect().y).toBeLessThan(released.y - 5)
	await expect.poll(() => Object.hasOwn(currentStage().dataset, 'panning')).toBe(false)
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(released.width, 0)
	expect(activeSlideLabel()).toBe('1 of 2')
	expect(viewer().open).toBe(true)
})

// Each axis once, toward either end: the limits themselves are unit tested
it.each([
	{ x: 1, y: 0 },
	{ x: 0, y: -1 },
])('moves in direction $x, $y and springs back from an overshoot', async (direction) => {
	await openZoomable()
	viewer().style.setProperty('--amk-lightbox-pan-padding', '24px')
	await pinch(2)
	lift()
	const before = currentLayer().getBoundingClientRect()
	const { x, y } = middleOf(currentStage())
	pointer('pointerdown', 1, x, y)
	pointer('pointermove', 1, x + direction.x * 100, y + direction.y * 100)
	await frames()
	const moved = currentLayer().getBoundingClientRect()
	expect(moved.x).toBeCloseTo(before.x + direction.x * 100, 0)
	expect(moved.y).toBeCloseTo(before.y + direction.y * 100, 0)
	const axis = direction.x === 0 ? 'y' : 'x'
	const size = direction.x === 0 ? 'height' : 'width'
	const sign = direction.x + direction.y
	// The same padding short of each edge of the viewer
	const stage = currentStage().getBoundingClientRect()
	const bound = stage[axis] + (sign < 0 ? stage[size] - before[size] : 0) + sign * 24
	const distance = Math.abs(bound - before[axis]) + 400
	pointer('pointermove', 1, x + direction.x * distance, y + direction.y * distance)
	await frames()
	const held = currentLayer().getBoundingClientRect()
	// Long pulls continue to give way instead of flattening against a 96px cap.
	expect((held[axis] - bound) * sign).toBeCloseTo(140, 0)
	await settle(120)
	lift()
	expect(Object.hasOwn(currentStage().dataset, 'panning')).toBe(true)
	await frames(5)
	expect((currentLayer().getBoundingClientRect()[axis] - bound) * sign).toBeLessThan(
		(held[axis] - bound) * sign,
	)
	await expect.poll(() => Object.hasOwn(currentStage().dataset, 'panning')).toBe(false)
	expect(currentLayer().getBoundingClientRect()[axis]).toBeCloseTo(bound, 0)
})

it('keeps the stage transparent and free of scrollbars while panning', async () => {
	await openZoomable()
	await pinch(3)
	lift()
	await drag(2)
	lift()
	const stage = currentStage()
	const style = getComputedStyle(stage)
	expect(style.overflowX).toBe('clip')
	expect(style.overflowY).toBe('clip')
	expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
	expect(stage.clientWidth).toBe(stage.offsetWidth)
	expect(stage.clientHeight).toBe(stage.offsetHeight)
	stage.scrollTo(100, 100)
	expect(stage.scrollLeft).toBe(0)
	expect(stage.scrollTop).toBe(0)
})

it('catches momentum on a fresh press without turning its release into a tap', async () => {
	await openZoomable()
	await pinch(3)
	lift()
	await drag(2)
	lift()
	await frames(3)
	expect(Object.hasOwn(currentStage().dataset, 'panning')).toBe(true)
	const { x, y } = middleOf(currentStage())
	pointer('pointerdown', 1, x, y)
	const caught = currentLayer().getBoundingClientRect()
	await frames(5)
	expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(caught.toJSON())
	lift()
	pointer('click', 1, x, y)
	expect(viewer().querySelector('[data-zoomed]')).not.toBeNull()
	expect(viewer().open).toBe(true)
})

it.each(['pause', 'cancel', 'reduced motion'])('does not coast after a %s', async (ending) => {
	await openZoomable()
	await pinch(3)
	lift()
	if (ending === 'reduced motion') {
		await commands.emulateReducedMotion(true)
	}

	await drag()
	if (ending === 'pause') {
		await settle(120)
	} else if (ending === 'cancel') {
		pointer('pointercancel', 1, 0, 0)
	}

	const before = currentLayer().getBoundingClientRect()
	lift()
	await frames(5)
	expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(before.toJSON())
	expect(Object.hasOwn(currentStage().dataset, 'panning')).toBe(false)
})

it('stops momentum before closing and starts the next opening fitted', async () => {
	await openZoomable()
	await pinch(3)
	lift()
	await drag()
	lift()
	const stage = currentStage()
	expect(Object.hasOwn(stage.dataset, 'panning')).toBe(true)
	await closeLightbox()
	expect(Object.hasOwn(stage.dataset, 'panning')).toBe(false)
	await openZoomable()
	expect(viewer().querySelector('[data-zoomed]')).toBeNull()
})

it.for([1, 2])('preserves native %i-finger release velocity', async (fingers, { skip }) => {
	await openZoomable()
	await pinch(3)
	lift()
	const { x, y } = middleOf(currentStage())
	const contacts = [{ id: 1, x: x - 50, y }]
	if (fingers === 2) {
		contacts.push({ id: 2, x: x + 50, y })
	}

	if (!(await commands.touchContacts(contacts))) {
		skip()
		return
	}

	for (let i = 0; i < 4; i++) {
		for (const contact of contacts) {
			contact.x -= 25
			contact.y -= 15
		}

		await commands.touchContacts(contacts)
		await frames()
	}

	const before = currentLayer().getBoundingClientRect()
	await commands.touchContacts([])
	await expect.poll(() => currentLayer().getBoundingClientRect().x).toBeLessThan(before.x - 10)
	expect(activeSlideLabel()).toBe('1 of 2')
})
