import { describe, expect, it } from 'vitest'
import type { Axis } from '../src/components/internal/lightbox/pan-math'
import {
	advance,
	atRest,
	launch,
	limit,
	limitsOf,
	unlimit,
} from '../src/components/internal/lightbox/pan-math'

const viewport = { x: 1280, y: 800 }
/** A square subject fitted in the middle of the viewport, 40px from its edges. */
const fitted = { height: 720, width: 720, x: 280, y: 40 }

/** Run a released axis until it rests, and return how long that took, in ms. */
function run(axis: Axis, min: number, max: number): number {
	let elapsed = 0
	while (!atRest(axis, min, max) && elapsed < 5000) {
		advance(axis, min, max, 8)
		elapsed += 8
	}

	return elapsed
}

describe('pan limits', () => {
	it('holds a subject at its fitted size where it fitted', () => {
		const { min, max } = limitsOf(fitted, { x: 720, y: 720 }, viewport, 32)
		expect(min).toEqual({ x: 280, y: 40 })
		expect(max).toEqual({ x: 280, y: 40 })
	})

	it('keeps a subject larger than the viewport the padding short of every edge', () => {
		const { min, max } = limitsOf(fitted, { x: 2880, y: 2880 }, viewport, 32)
		expect(max).toEqual({ x: 32, y: 32 })
		expect(min).toEqual({ x: 1280 - 32 - 2880, y: 800 - 32 - 2880 })
	})

	it('centers an axis too short to reach both edges on the fitted subject', () => {
		// Twice the size: taller than the viewport, but not as wide
		const { min, max } = limitsOf(fitted, { x: 1200, y: 1200 }, viewport, 32)
		expect(min.x).toBe(40)
		expect(max.x).toBe(40)
		expect(max.y).toBe(32)
		expect(min.y).toBe(800 - 32 - 1200)
	})

	it('lets an edge that reaches the padding first move between there and the middle', () => {
		// Fitted above the middle, as over a caption: growing reaches the top first
		const raised = { height: 400, width: 600, x: 340, y: 40 }
		const { min, max } = limitsOf(raised, { x: 660, y: 440 }, viewport, 32)
		expect(min.y).toBe(20)
		expect(max.y).toBe(32)
		expect(min.x).toBe(max.x)
	})

	it('never crosses its limits, whatever the size, padding, or fitted place', () => {
		for (const size of [10, 300, 720, 721, 1300, 9000]) {
			for (const padding of [0, 32, 500]) {
				for (const place of [fitted, { height: 50, width: 900, x: 0, y: 700 }]) {
					const { min, max } = limitsOf(place, { x: size, y: size * 0.6 }, viewport, padding)
					expect(min.x).toBeLessThanOrEqual(max.x)
					expect(min.y).toBeLessThanOrEqual(max.y)
				}
			}
		}
	})
})

describe('edge resistance', () => {
	it('draws a position within the limits where it is asked', () => {
		expect(limit(50, 0, 100, false)).toBe(50)
		expect(limit(50, 0, 100, true)).toBe(50)
	})

	it('stops at a limit, or follows 35% of a pull past it', () => {
		expect(limit(300, 0, 100, false)).toBe(100)
		expect(limit(300, 0, 100, true)).toBeCloseTo(170, 6)
		expect(limit(-400, 0, 100, true)).toBeCloseTo(-140, 6)
	})

	it('undoes the resistance, so a finger picks up where the subject is held', () => {
		for (const at of [-900, -1, 0, 40, 100, 101, 4000]) {
			expect(unlimit(limit(at, 0, 100, true), 0, 100)).toBeCloseTo(at, 6)
		}
	})
})

describe('release', () => {
	it('does not coast from a resting hand, and caps a hard flick', () => {
		expect(launch({ x: 0.05, y: 0.05 })).toEqual({ x: 0, y: 0 })
		expect(launch({ x: 1, y: -0.5 })).toEqual({ x: 1, y: -0.5 })
		const capped = launch({ x: 6, y: 8 })
		expect(Math.hypot(capped.x, capped.y)).toBeCloseTo(3, 6)
		expect(capped.y / capped.x).toBeCloseTo(8 / 6, 6)
	})

	it('coasts within its limits as far as its speed carries it in the coast time', () => {
		const axis: Axis = { at: 0, speed: 1 }
		run(axis, -10_000, 10_000)
		expect(axis.end).toBeUndefined()
		// All but the last hundredth of a pixel per millisecond of its speed
		expect(axis.at).toBeGreaterThan(325 * 0.98)
		expect(axis.at).toBeLessThan(325)
	})

	it('covers the same ground in few long frames as in many short ones', () => {
		const smooth: Axis = { at: 0, speed: -2 }
		const coarse: Axis = { at: 0, speed: -2 }
		for (let i = 0; i < 40; i++) {
			advance(smooth, -10_000, 10_000, 8)
		}

		for (let i = 0; i < 10; i++) {
			advance(coarse, -10_000, 10_000, 32)
		}

		expect(coarse.at).toBeCloseTo(smooth.at, 6)
		expect(coarse.speed).toBeCloseTo(smooth.speed, 6)
	})

	it('springs back to the limit it was let go past, and rests there', () => {
		const axis: Axis = { at: 180, speed: 0 }
		const elapsed = run(axis, 0, 100)
		expect(axis.end).toBe(100)
		expect(axis.at).toBeCloseTo(100, 0)
		expect(elapsed).toBeLessThan(1000)
	})

	it('turns a coast that crosses a limit into a spring back to it', () => {
		const axis: Axis = { at: 60, speed: 2 }
		let furthest = axis.at
		let elapsed = 0
		while (!atRest(axis, 0, 100) && elapsed < 5000) {
			advance(axis, 0, 100, 8)
			furthest = Math.max(furthest, axis.at)
			elapsed += 8
		}

		expect(axis.end).toBe(100)
		expect(furthest).toBeGreaterThan(100)
		expect(axis.at).toBeCloseTo(100, 0)
	})

	it('keeps to its spring through a bounce back inside the limit', () => {
		const axis: Axis = { at: 130, speed: -3 }
		let lowest = axis.at
		while (!atRest(axis, 0, 100)) {
			advance(axis, 0, 100, 8)
			lowest = Math.min(lowest, axis.at)
		}

		// It dips inside the limit on its way, far short of the 975px its speed
		// would have coasted, and comes back to the limit
		expect(lowest).toBeLessThan(100)
		expect(130 - lowest).toBeLessThan(975 / 4)
		expect(axis.end).toBe(100)
		expect(axis.at).toBeCloseTo(100, 0)
	})

	it('is at rest only when slow and within its limits, or on its target', () => {
		expect(atRest({ at: 50, speed: 0 }, 0, 100)).toBe(true)
		expect(atRest({ at: 50, speed: 0.5 }, 0, 100)).toBe(false)
		expect(atRest({ at: 150, speed: 0 }, 0, 100)).toBe(false)
		expect(atRest({ at: 100.2, end: 100, speed: 0 }, 0, 100)).toBe(true)
		expect(atRest({ at: 60, end: 100, speed: 0 }, 0, 100)).toBe(false)
	})
})
