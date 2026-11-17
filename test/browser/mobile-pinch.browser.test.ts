import { expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import './helpers'

it.for(
	[
		{ width: 390, height: 844 },
		{ width: 820, height: 1180 },
	].flatMap((size) => ['native', 'fit', 'fill'].map((level, index) => ({ ...size, index, level }))),
)(
	'pinches and pans the $level image at $width × $height before resuming swipe navigation',
	{ timeout: 20_000 },
	async (size, { skip }) => {
		const states = await commands.mobileGallery(
			[
				{ index: size.index, type: 'open' },
				{ scale: 2, type: 'pinch' },
				{ dx: -80, dy: 0, type: 'drag', x: size.width / 2, y: size.height / 2 },
				{ dx: 40, dy: 0, fingers: 2, type: 'drag', x: size.width / 2, y: size.height / 2 },
				{ scale: 0.4, type: 'pinch' },
				{
					dx: size.width * (size.index === 2 ? 0.65 : -0.65),
					dy: 12,
					type: 'drag',
					x: size.width * (size.index === 2 ? 0.2 : 0.8),
					y: size.height / 2,
				},
			],
			size,
		)
		if (states === false) {
			skip()
			return
		}

		for (const state of states) {
			expect(state.isOpen).toBe(true)
			expect(state.controlsVisible).toBe(true)
			expect(state.viewport.scale).toBeCloseTo(1, 2)
			expect(state.scrollY).toBe(states[0]!.scrollY)
		}

		for (const state of states.slice(1, 4)) {
			expect(state.isZoomed).toBe(true)
			expect(state.label).toBe(`${size.index + 1} of 3`)
			expect(state.imageWidth).toBeGreaterThan(states[0]!.imageWidth * 1.5)
		}

		expect(states[2]!.stageX).toBeGreaterThan(states[1]!.stageX + 30)
		expect(states[3]!.stageX).toBeLessThan(states[2]!.stageX - 20)
		expect(states[4]!.isZoomed).toBe(false)
		expect(states[5]!.label).toBe(`${size.index === 2 ? 2 : size.index + 2} of 3`)
	},
)
