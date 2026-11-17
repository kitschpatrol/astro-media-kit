import { describe, expect, it } from 'vitest'
import {
	isPastClosing,
	maximumWidth,
	requestedWidth,
	resist,
	settledWidth,
	settleRemaining,
	shrink,
} from '../src/components/internal/lightbox/zoom-math'

const limits = { fit: 720, maximum: maximumWidth(720) }

describe('zoom limits', () => {
	it('lets a subject grow to a multiple of its fitted width, or a larger preset', () => {
		expect(maximumWidth(720)).toBe(5760)
		expect(maximumWidth(720, 2400)).toBe(5760)
		expect(maximumWidth(100, 2400)).toBe(2400)
		expect(maximumWidth(720, 0, 3)).toBe(2160)
		expect(maximumWidth(720, 2400, 3)).toBe(2400)
		expect(maximumWidth(720, 0, 1)).toBe(720)
	})

	it('settles a size let go past a limit on that limit, and leaves one between them', () => {
		expect(settledWidth(300, limits)).toBe(720)
		expect(settledWidth(1500, limits)).toBe(1500)
		expect(settledWidth(9000, limits)).toBe(5760)
	})
})

describe('pinch resistance', () => {
	it('follows the fingers between the limits, and at them', () => {
		for (const width of [720, 721, 2000, 5760]) {
			expect(resist(width, limits)).toBe(width)
			expect(requestedWidth(width, limits)).toBe(width)
		}
	})

	it('follows 15% of a pinch below fit', () => {
		expect(resist(720 - 400, limits)).toBeCloseTo(720 - 60, 6)
		expect(resist(0, limits)).toBeCloseTo(720 * 0.85, 6)
	})

	it('follows 5% of a pinch just past the maximum, and less the further it goes', () => {
		const near = resist(5760 + 100, limits) - 5760
		const far = resist(5760 + 10_000, limits) - 5760
		expect(near).toBeGreaterThan(4.9)
		expect(near).toBeLessThan(5)
		expect(far).toBeGreaterThan(near)
		expect(far / 10_000).toBeLessThan(near / 100)
	})

	it('never stretches a tenth past the maximum, however far the fingers spread', () => {
		let previous = 5760
		for (const width of [6000, 10_000, 100_000, 10_000_000]) {
			const drawn = resist(width, limits)
			expect(drawn).toBeGreaterThan(previous)
			expect(drawn).toBeLessThan(5760 * 1.1)
			previous = drawn
		}
	})

	it('undoes resistance, so a pinch picks up where the subject is held', () => {
		for (const width of [0, 50, 400, 719, 720, 3000, 5761, 7000, 12_000, 17_000]) {
			expect(requestedWidth(resist(width, limits), limits)).toBeCloseTo(width, 6)
		}
	})

	it('stays finite for a size drawn at the very end of the stretch', () => {
		const asked = requestedWidth(5760 * 1.1, limits)
		expect(Number.isFinite(asked)).toBe(true)
		expect(asked).toBeGreaterThan(5760 * 1.1)
		expect(requestedWidth(-100, limits)).toBe(0)
	})
})

describe('pinch to close', () => {
	it('gives up closing once a pinch has grown a fifteenth past fit', () => {
		expect(isPastClosing(720, 720)).toBe(false)
		expect(isPastClosing(720 * (1 + 1 / 15), 720)).toBe(false)
		expect(isPastClosing(720 * (1 + 1 / 15) + 0.01, 720)).toBe(true)
	})

	it('follows the fingers as they are, dimming the viewer as the subject shrinks', () => {
		expect(shrink(720, 720)).toEqual({ fade: 1, width: 720 })
		expect(shrink(360, 720).width).toBe(360)
		expect(shrink(360, 720).fade).toBeCloseTo(0.4, 6)
		expect(shrink(288, 720).fade).toBeCloseTo(0.28, 6)
	})

	it('has dimmed the viewer fully at a sixth of fit, and stops shrinking at a tenth', () => {
		expect(shrink(120, 720).fade).toBeCloseTo(0, 6)
		expect(shrink(100, 720).fade).toBe(0)
		expect(shrink(10, 720)).toEqual({ fade: 0, width: 72 })
		expect(shrink(-50, 720).width).toBe(72)
	})
})

describe('settling', () => {
	it('starts with the whole way to go and never overshoots', () => {
		expect(settleRemaining(0)).toBe(1)
		expect(settleRemaining(-20)).toBe(1)
		let previous = 1
		for (let elapsed = 8; elapsed <= 400; elapsed += 8) {
			const remaining = settleRemaining(elapsed)
			expect(remaining).toBeLessThan(previous)
			expect(remaining).toBeGreaterThan(0)
			previous = remaining
		}
	})

	it('is most of the way in a tenth of a second and done within a quarter', () => {
		expect(settleRemaining(100)).toBeLessThan(0.1)
		expect(settleRemaining(240)).toBeLessThan(0.001)
		expect(settleRemaining(200)).toBeGreaterThan(0.001)
	})
})
