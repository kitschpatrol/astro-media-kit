import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { WheelSample } from '../src/components/internal/lightbox/wheel'
import type { WheelEvents } from './wheel-events'
import {
	addSample,
	isFromFingers,
	momentumOnset,
	speedOver,
} from '../src/components/internal/lightbox/wheel'
import { easedScroll } from './wheel-events'

type Swipe = { events: WheelEvents; name: string }

const { swipes } = JSON.parse(
	readFileSync(new URL('fixtures/safari-trackpad-swipes.json', import.meta.url), 'utf8'),
) as { swipes: Swipe[] }

/** The speed, in px/ms, past which letting go turns a slide, as in motion.ts. */
const flickSpeed = 0.3

/** How far back, in ms, events count when a gesture just stops, as in motion.ts. */
const haltWindow = 50

function swipe(name: string): WheelEvents {
	const found = swipes.find((each) => each.name === name)
	if (found === undefined) {
		throw new Error(`No recorded swipe is named "${name}"`)
	}

	return found.events
}

/**
 * Feed events along the track, as the carousel does, until momentum shows the
 * fingers lifted, or else to their end: how it lets go, and the rest.
 */
function replay(events: WheelEvents) {
	const samples: WheelSample[] = []
	for (const [index, [time, delta]] of events.entries()) {
		if (delta === 0) {
			continue
		}

		addSample(samples, { delta, time })
		const onset = momentumOnset(samples)
		if (onset !== undefined) {
			return { after: events.slice(index + 1), release: 'momentum', samples, speed: onset, time }
		}
	}

	return {
		after: [],
		release: 'end',
		samples,
		speed: speedOver(samples, haltWindow),
		time: Infinity,
	}
}

/** Events as Chromium delivers them when every `nth` arrives with the next. */
function merged(events: WheelEvents, nth: number): WheelEvents {
	const result: WheelEvents = []
	let held: undefined | WheelEvents[number]
	for (const [index, [time, deltaX, deltaY]] of events.entries()) {
		const event: WheelEvents[number] = [time, deltaX + (held?.[1] ?? 0), deltaY + (held?.[2] ?? 0)]
		if (index % nth === nth - 1) {
			held = event
		} else {
			held = undefined
			result.push(event)
		}
	}

	return result
}

const flicks = [
	'quick short flick left',
	'quick flick left',
	'quick flick right',
	'gentlest flick left that should turn a page',
]

describe('trackpad wheel gestures', () => {
	it.for(flicks)('lets go of "%s" once its momentum shows, fast enough to flick', (name) => {
		const events = swipe(name)
		const { release, speed } = replay(events)
		const direction = Math.sign(events.reduce((sum, [, delta]) => sum + delta, 0))
		expect(release).toBe('momentum')
		expect(Math.sign(speed)).toBe(direction)
		expect(Math.abs(speed)).toBeGreaterThan(flickSpeed)
	})

	it.for(flicks)('tells the momentum of "%s" when events arrive merged', (name) => {
		for (const nth of [3, 4, 5]) {
			const { release, speed } = replay(merged(swipe(name), nth))
			expect(release).toBe('momentum')
			expect(Math.abs(speed)).toBeGreaterThan(flickSpeed)
		}
	})

	it('tells the momentum after a long drag from the drag', () => {
		const { release, speed, time } = replay(
			swipe('fast drag left two thirds, then slow drags right'),
		)
		// The fingers lift at about 740 ms, still moving left
		expect(release).toBe('momentum')
		expect(time).toBeGreaterThan(740)
		expect(speed).toBeLessThan(-flickSpeed)
	})

	it('lets a quick scroll that slows to a stop settle, however fast it was', () => {
		const { release, speed } = replay(swipe('quick short flick left, no momentum'))
		expect(release).toBe('end')
		expect(Math.abs(speed)).toBeLessThan(flickSpeed)
	})

	it('follows a slow drag to its end, too slow to flick', () => {
		const { release, speed } = replay(swipe('slow drag left a third, lifted while moving slowly'))
		expect(release).toBe('end')
		expect(Math.abs(speed)).toBeLessThan(flickSpeed)
	})

	it('takes fingers that slow, pause, and turn back for fingers throughout', () => {
		const { release, speed } = replay(swipe('drag left, pause, then back right past the start'))
		expect(release).toBe('end')
		expect(Math.abs(speed)).toBeLessThan(flickSpeed)
	})

	it.for([
		[300, 0.5],
		[400, 0.5],
		[400, 0.25],
		[500, 0.4],
		[500, 0.25],
		[600, 0.4],
		[600, 0.25],
		[800, 0.5],
		[800, 0.25],
		[1200, 0.5],
		[1200, 0.25],
		[2000, 0.4],
	] as const)(
		'takes fingers easing to a stop over %i ms, short of half a slide, for fingers',
		([duration, peak]) => {
			for (const distance of [200, 300, 400, 500, 600, 700]) {
				const { release } = replay(easedScroll(duration, distance, peak))
				expect(release, `${String(distance)} px`).toBe('end')
			}
		},
	)

	it.for(flicks)('never takes the momentum after "%s" for fingers back on the trackpad', (name) => {
		const { after, samples } = replay(swipe(name))
		let count = 0
		for (const [time, delta] of after) {
			if (delta === 0) {
				continue
			}

			const sample = { delta, time }
			expect(isFromFingers(samples, sample), `at ${String(time)} ms`).toBe(false)
			addSample(samples, sample)
			count++
		}

		expect(count).toBeGreaterThan(10)
	})

	it('sees fingers back on the trackpad among momentum', () => {
		const crawl: WheelSample[] = [20, 37, 53, 87, 103].map((time) => ({ delta: 1, time }))
		// A new swipe grows out of the crawl
		expect(isFromFingers(crawl, { delta: 1, time: 120 })).toBe(false)
		expect(isFromFingers(crawl, { delta: 5, time: 120 })).toBe(true)
		// It reverses
		expect(isFromFingers(crawl, { delta: -1, time: 120 })).toBe(true)
		// It follows a silence
		expect(isFromFingers(crawl, { delta: 1, time: 170 })).toBe(true)

		const fast: WheelSample[] = [17, 33, 50, 67, 83].map((time, index) => ({
			delta: 40 - index * 3,
			time,
		}))
		expect(isFromFingers(fast, { delta: 26, time: 100 })).toBe(false)
		// Momentum can jump as the fingers lift, well after the track was let go
		expect(isFromFingers(fast, { delta: 50, time: 100 })).toBe(false)
		// Fingers that stopped it, moving slowly on
		expect(isFromFingers(fast, { delta: 1, time: 117 })).toBe(true)
	})

	it('tells fingers moving steadily from momentum', () => {
		const samples: WheelSample[] = []
		for (let index = 0; index < 30; index++) {
			addSample(samples, { delta: 20, time: index * 16 })
			expect(momentumOnset(samples)).toBeUndefined()
		}
	})

	it('needs no history to measure a lone event', () => {
		expect(momentumOnset([])).toBeUndefined()
		expect(speedOver([], haltWindow)).toBe(0)
		// A mouse wheel's single turn still moves fast enough to flick
		expect(speedOver([{ delta: 100, time: 5000 }], haltWindow)).toBeGreaterThan(flickSpeed)
		// As does one a while after another
		const turns = [
			{ delta: 100, time: 5000 },
			{ delta: 100, time: 5070 },
		]
		expect(speedOver(turns, haltWindow)).toBeGreaterThan(flickSpeed)
	})

	it('forgets old events, but keeps enough to tell momentum', () => {
		const samples: WheelSample[] = []
		for (let index = 0; index < 200; index++) {
			addSample(samples, { delta: 1, time: index * 16 })
		}

		expect(samples.length).toBeLessThan(25)
		expect(samples.at(-1)!.time - samples[0]!.time).toBeGreaterThanOrEqual(200)
		const slow: WheelSample[] = []
		for (let index = 0; index < 10; index++) {
			addSample(slow, { delta: 1, time: index * 500 })
		}

		expect(slow).toHaveLength(1)
	})
})
