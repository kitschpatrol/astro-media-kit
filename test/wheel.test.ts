import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { WheelSample } from '../src/components/internal/lightbox/wheel'
import {
	addSample,
	isNewGesture,
	momentumOnset,
	recentPeakSpeed,
} from '../src/components/internal/lightbox/wheel'

type Swipe = { events: Array<[time: number, deltaX: number, deltaY: number]>; name: string }

const { swipes } = JSON.parse(
	readFileSync(new URL('fixtures/safari-trackpad-swipes.json', import.meta.url), 'utf8'),
) as { swipes: Swipe[] }

/** The speed, in px/ms, past which letting go turns a slide, as in motion.ts. */
const flickSpeed = 0.3

function swipe(name: string): Swipe {
	const found = swipes.find((each) => each.name === name)
	if (found === undefined) {
		throw new Error(`No recorded swipe is named "${name}"`)
	}

	return found
}

/**
 * Feed a swipe's events along the track, as the carousel does, until momentum
 * shows the fingers lifted, or else to its end: how it lets go, and the rest.
 */
function replay({ events }: Swipe) {
	const samples: WheelSample[] = []
	for (const [index, [time, delta]] of events.entries()) {
		if (delta === 0) {
			continue
		}

		addSample(samples, { delta, time })
		const onset = momentumOnset(samples)
		if (onset !== undefined) {
			return { after: events.slice(index + 1), release: 'momentum', speed: onset, time }
		}
	}

	return { after: [], release: 'end', speed: recentPeakSpeed(samples), time: Infinity }
}

describe('trackpad wheel gestures', () => {
	it.for([
		'quick short flick left',
		'quick flick left',
		'quick flick right',
		'big fast swipe left',
		'gentlest flick left that should turn a page',
	])('lets go of "%s" as momentum starts, fast enough to flick', (name) => {
		const recorded = swipe(name)
		const { release, speed } = replay(recorded)
		const direction = Math.sign(recorded.events.reduce((sum, [, delta]) => sum + delta, 0))
		expect(release).toBe('momentum')
		expect(Math.sign(speed)).toBe(direction)
		expect(Math.abs(speed)).toBeGreaterThan(flickSpeed)
	})

	it('takes a flick that gets no momentum at the speed it reached before it stopped', () => {
		const { release, speed } = replay(swipe('quick short flick left, no momentum'))
		expect(release).toBe('end')
		expect(speed).toBeLessThan(-flickSpeed)
	})

	it('follows a slow drag to its end, too slow to flick', () => {
		const { release, speed } = replay(swipe('slow drag left a third, lifted while moving slowly'))
		expect(release).toBe('end')
		expect(Math.abs(speed)).toBeLessThan(flickSpeed)
	})

	it('takes neither a slowdown nor a pause before a reversal for momentum', () => {
		const { release, speed, time } = replay(
			swipe('drag left, pause, then back right past the start'),
		)
		// The leftward drag ends at 566 ms; the first release is on the way back
		expect(release).toBe('momentum')
		expect(time).toBeGreaterThan(566)
		expect(speed).toBeGreaterThan(0)
	})

	it.for([
		'quick short flick left',
		'quick flick left',
		'quick flick right',
		'big fast swipe left',
		'gentlest flick left that should turn a page',
	])('never takes the momentum after "%s" for fingers back on the trackpad', (name) => {
		const { after } = replay(swipe(name))
		const deltas = after.map(([, delta]) => delta).filter((delta) => delta !== 0)
		expect(deltas.length).toBeGreaterThan(10)
		const restarts = deltas.filter(
			(delta, index) => index > 0 && isNewGesture(deltas[index - 1]!, delta),
		)
		expect(restarts).toEqual([])
	})

	it('sees fingers back on the trackpad when the events grow or reverse', () => {
		// The momentum tail, then a new swipe starting
		expect(isNewGesture(1, 3)).toBe(true)
		expect(isNewGesture(12, -1)).toBe(true)
		expect(isNewGesture(-2, 1)).toBe(true)
		expect(isNewGesture(10, 10)).toBe(false)
	})

	it('tells fingers moving steadily from momentum', () => {
		const samples: WheelSample[] = []
		for (let index = 0; index < 12; index++) {
			addSample(samples, { delta: 20, time: index * 16 })
		}

		expect(momentumOnset(samples)).toBeUndefined()
	})

	it('needs no history to measure a lone event', () => {
		expect(momentumOnset([])).toBeUndefined()
		expect(recentPeakSpeed([])).toBe(0)
		// A mouse wheel's single turn still moves fast enough to flick
		expect(recentPeakSpeed([{ delta: 100, time: 5000 }])).toBeGreaterThan(flickSpeed)
	})

	it('forgets old events, but keeps enough to tell momentum', () => {
		const samples: WheelSample[] = []
		for (let index = 0; index < 200; index++) {
			addSample(samples, { delta: 1, time: index * 16 })
		}

		expect(samples.length).toBeLessThan(20)
		expect(samples.length).toBeGreaterThanOrEqual(5)
		const slow: WheelSample[] = []
		for (let index = 0; index < 10; index++) {
			addSample(slow, { delta: 1, time: index * 500 })
		}

		expect(slow).toHaveLength(5)
	})
})
