import { expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import './helpers'

it('contains two-finger drags and pinches inside the open mobile gallery', async ({ skip }) => {
	const states = await commands.mobileGallery([
		{ type: 'open' },
		{ scale: 2, type: 'pinch' },
		{ dx: 0, dy: -240, fingers: 2, type: 'drag', x: 410, y: 600 },
		{ dx: -240, dy: 0, fingers: 2, type: 'drag', x: 410, y: 600 },
		{ type: 'next' },
		{ type: 'close' },
		{ scale: 2, type: 'pinch' },
	])
	if (states === false) {
		skip()
		return
	}

	for (const state of states.slice(0, 4)) {
		expect(state.isOpen).toBe(true)
		expect(state.viewport.scale).toBeCloseTo(1, 2)
		expect(state.scrollY).toBe(states[0]!.scrollY)
		expect(state.label).toBe('1 of 3')
		expect(state.isDismissing).toBe(false)
		expect(state.isDragging).toBe(false)
	}

	expect(states[4]!.label).toBe('2 of 3')
	expect(states[5]!.isOpen).toBe(false)
	expect(states[6]!.viewport.scale).toBeGreaterThan(1.5)
}, 20_000)

it('pans the built-in zoom and recovers after ignored two-finger gestures', async ({ skip }) => {
	const states = await commands.mobileGallery([
		{ type: 'open' },
		{ type: 'zoom' },
		{ dx: -120, dy: -120, type: 'drag', x: 410, y: 600 },
		{ dx: -120, dy: -120, fingers: 2, type: 'drag', x: 410, y: 600 },
		{ dx: 80, dy: 80, type: 'drag', x: 410, y: 600 },
		{ scale: 2, type: 'pinch' },
		{ type: 'close' },
	])
	if (states === false) {
		skip()
		return
	}

	for (const state of states.slice(1, 6)) {
		expect(state.isZoomed).toBe(true)
		expect(state.label).toBe('1 of 3')
		expect(state.viewport.scale).toBeCloseTo(1, 2)
		expect(state.scrollY).toBe(states[0]!.scrollY)
	}

	expect(states[2]!.stageX).toBeGreaterThan(states[1]!.stageX + 40)
	expect(states[2]!.stageY).toBeGreaterThan(states[1]!.stageY + 40)
	expect(states[3]!.stageX).toBeCloseTo(states[2]!.stageX, 0)
	expect(states[4]!.stageX).toBeLessThan(states[3]!.stageX - 40)
	expect(states[6]!.isOpen).toBe(false)
}, 20_000)

it('keeps the gallery and its controls inside an already zoomed visual viewport', async ({
	skip,
}) => {
	const states = await commands.mobileGallery([
		{ scale: 2, type: 'scale' },
		{ type: 'open' },
		{ type: 'zoom' },
		{ height: 820, type: 'resize', width: 1180 },
		{ type: 'close' },
	])
	if (states === false) {
		skip()
		return
	}

	for (const state of states.slice(1, 4)) {
		expect(state.controlsVisible).toBe(true)
		expect(state.dialog!.width).toBeCloseTo(state.viewport.width, 0)
		expect(state.dialog!.height).toBeCloseTo(state.viewport.height, 0)
		expect(state.dialog!.x).toBeCloseTo(state.viewport.x, 0)
		expect(state.dialog!.y).toBeCloseTo(state.viewport.y, 0)
	}

	expect(states[3]!.isZoomed).toBe(true)
	expect(states[4]!.isOpen).toBe(false)
}, 20_000)

it.each([
	{ width: 390, height: 844 },
	{ width: 820, height: 1180 },
])(
	'retains usable controls and zoom on a $width × $height mobile screen',
	async (size) => {
		const states = await commands.mobileGallery(
			[
				{ type: 'open' },
				{ type: 'zoom' },
				{ height: size.height - 80, type: 'resize', width: size.width },
				{ height: size.width, type: 'resize', width: size.height },
				{ type: 'close' },
			],
			size,
		)
		expect(states).not.toBe(false)
		if (states === false) {
			return
		}

		for (const state of states.slice(0, 4)) {
			expect(state.isOpen).toBe(true)
			expect(state.controlsVisible).toBe(true)
		}

		for (const state of states.slice(1, 4)) {
			expect(state.isZoomed).toBe(true)
			expect(state.imageWidth).toBeCloseTo(2400, 0)
		}

		expect(states[4]!.isOpen).toBe(false)
	},
	20_000,
)
