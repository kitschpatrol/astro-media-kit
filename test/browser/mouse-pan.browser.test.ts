import { afterEach, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	block,
	boxes,
	cleanUp,
	clickSubject,
	currentLayer,
	currentStage,
	frames,
	item,
	middleOf,
	mount,
	openZoomable,
	query,
	settle,
	setUpLightbox,
	transitionsDone,
	viewer,
} from './helpers'
import { lift, pointer } from './touch'

setUpLightbox()
afterEach(async () => {
	await commands.mouseUp()
	await commands.emulateReducedMotion(false)
	await cleanUp()
})

async function open() {
	await openZoomable('native')
	await clickSubject(0.5, 0.5)
	await transitionsDone()
	return middleOf(currentStage())
}

it('shows a grabbing hand on the captured pointer and carries a quick release in both axes', async () => {
	const { x, y } = await open()
	const before = currentLayer().getBoundingClientRect()
	await commands.mouseDown(x, y)
	await commands.mouseMove(x - 50, y - 30)
	// The stage holds the pointer, so its cursor shows wherever the drag goes
	const track = query(viewer(), '.amk-lightbox-track')
	expect(currentStage().hasPointerCapture(1)).toBe(true)
	expect(getComputedStyle(currentStage()).cursor).toBe('grabbing')
	expect(getComputedStyle(currentLayer()).cursor).toBe('grabbing')
	await commands.mouseFlick(x - 150, y - 90)
	await expect.poll(() => currentLayer().getBoundingClientRect().x).toBeLessThan(before.x - 170)
	await expect.poll(() => currentLayer().getBoundingClientRect().y).toBeLessThan(before.y - 100)
	expect(getComputedStyle(track).cursor).toBe('zoom-out')
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(before.width, 0)
	expect(activeSlideLabel()).toBe('1 of 2')
})

it('catches momentum on a press without zooming out on release, then accepts a fresh click', async () => {
	const { x, y } = await open()
	await commands.mouseDown(x, y)
	await commands.mouseFlick(x - 100, y - 60)
	await frames(2)
	expect(Object.hasOwn(currentStage().dataset, 'panning')).toBe(true)
	await commands.mouseDown(x, y)
	const caught = currentLayer().getBoundingClientRect()
	await frames(5)
	expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(caught.toJSON())
	await commands.mouseUp()
	expect(viewer().querySelector('[data-zoomed]')).not.toBeNull()
	await commands.mouseDown(x, y)
	await commands.mouseUp()
	await transitionsDone()
	expect(viewer().querySelector('[data-zoomed]')).toBeNull()
	expect(viewer().open).toBe(true)
})

it.each(['pause', 'capture loss', 'reduced motion'])(
	'does not coast after a mouse %s',
	async (ending) => {
		const { x, y } = await open()
		if (ending === 'reduced motion') {
			await commands.emulateReducedMotion(true)
		}

		await commands.mouseDown(x, y)
		await commands.mouseMove(x - 100, y - 60)
		if (ending === 'pause') {
			await settle(120)
		} else if (ending === 'capture loss') {
			currentStage().releasePointerCapture(1)
		}

		// A move shows with the next frame
		await frames()
		const held = currentLayer().getBoundingClientRect()
		await commands.mouseUp()
		await frames(5)
		expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(held.toJSON())
		expect(Object.hasOwn(currentStage().dataset, 'panning')).toBe(false)
	},
)

it('cleans up mouse momentum and its cursor when closing', async () => {
	const { x, y } = await open()
	await commands.mouseDown(x, y)
	await commands.mouseFlick(x - 100, y - 60)
	const stage = currentStage()
	await closeLightbox()
	expect(Object.hasOwn(stage.dataset, 'panning')).toBe(false)
	expect(viewer().querySelector('[data-dragging]')).toBeNull()
})

it('pans an enlarged subject that does not pinch the same way under fingers and a mouse', async () => {
	const fixture = mount(
		item(block('plain'), 'data-level="native" data-native-width="3000" style="width: 240px"'),
	)
	await openLightbox(boxes(fixture)[0]!)
	await clickSubject(0.5, 0.5)
	await transitionsDone()
	expect(viewer().querySelector('[data-zoomed]')).not.toBeNull()
	const { x, y } = middleOf(currentStage())
	const start = currentLayer().getBoundingClientRect()

	// One finger pans
	pointer('pointerdown', 1, x, y)
	pointer('pointermove', 1, x - 80, y - 40)
	await frames()
	const panned = currentLayer().getBoundingClientRect()
	expect(panned.x).toBeCloseTo(start.x - 80, 0)
	expect(panned.y).toBeCloseTo(start.y - 40, 0)

	// A second finger moves it with the pair's middle, and never resizes it
	pointer('pointerdown', 2, x + 100, y - 40)
	pointer('pointermove', 2, x + 300, y - 40)
	await frames()
	const held = currentLayer().getBoundingClientRect()
	expect(held.width).toBeCloseTo(start.width, 0)
	expect(held.x).toBeCloseTo(panned.x + 100, 0)
	lift()
	await transitionsDone()
	expect(viewer().open).toBe(true)

	// And so does a pressed mouse, without zooming back out as it lets go
	const before = currentLayer().getBoundingClientRect()
	await commands.mouseDown(x, y)
	await commands.mouseMove(x + 60, y + 30)
	await frames()
	expect(currentLayer().getBoundingClientRect().x).toBeCloseTo(before.x + 60, 0)
	expect(currentLayer().getBoundingClientRect().y).toBeCloseTo(before.y + 30, 0)
	await settle(120)
	await commands.mouseUp()
	await frames()
	expect(viewer().querySelector('[data-zoomed]')).not.toBeNull()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(start.width, 0)
})
