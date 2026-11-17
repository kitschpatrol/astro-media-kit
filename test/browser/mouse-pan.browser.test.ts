import { afterEach, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	boxes,
	cleanUp,
	clickSubject,
	currentLayer,
	currentStage,
	frames,
	middleOf,
	mount,
	query,
	settle,
	setUpLightbox,
	transitionsDone,
	viewer,
	zoomable,
} from './helpers'

setUpLightbox()
afterEach(async () => {
	await commands.mouseUp()
	await commands.emulateReducedMotion(false)
	await cleanUp()
})

async function open() {
	await openLightbox(boxes(mount(zoomable('native') + zoomable('native', 'aurora', 1600)))[0]!)
	await clickSubject(0.5, 0.5)
	await transitionsDone()
	return middleOf(currentStage())
}

it('shows a grabbing hand on the captured pointer and carries a quick release in both axes', async () => {
	const { x, y } = await open()
	const before = currentLayer().getBoundingClientRect()
	await commands.mouseDown(x, y)
	await commands.mouseMove(x - 50, y - 30)
	const track = query(viewer(), '.amk-lightbox-track')
	expect(getComputedStyle(track).cursor).toBe('grabbing')
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
			query(viewer(), '.amk-lightbox-track').releasePointerCapture(1)
		}

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
