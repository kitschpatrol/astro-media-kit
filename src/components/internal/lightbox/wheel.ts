/**
 * Telling a trackpad's fingers from the momentum the operating system adds once
 * they lift, from wheel events alone, which say nothing of either. Tuned on
 * Safari's: see `test/fixtures/safari-trackpad-swipes.json`. Speeds are
 * measured over spans of time rather than from one event to the next, since
 * Chromium delivers wheel events with each frame, merging those that arrive
 * together.
 */

/**
 * A wheel event along a track: how far it moves the track, in px toward later
 * slides, and when.
 */
export type WheelSample = { delta: number; time: number }

/** A display frame, in ms: how long a gesture's first event is taken to cover. */
const frame = 1000 / 60

/**
 * The longest, in ms, an event is taken to have been moving for. One later than
 * this after the last follows a pause, and moved only at its end.
 */
const longestEvent = 3 * frame

/**
 * The span, in ms, of each of the speeds compared to tell momentum: two frames,
 * which evens out events that come early, late, or merged.
 */
const momentumStep = 2 * frame

/**
 * How many such spans in a row must decay as momentum does: 200 ms, longer than
 * fingers easing to a stop over less than a slide stay as steady.
 */
const momentumSteps = 6

/**
 * How much of its speed momentum keeps from one span to the next. Safari's
 * keeps 74-86%, short of a hard swipe's, which has the track at the next slide
 * before it matters; fingers stopping lose more, sooner or later.
 */
const momentumKeeps = { least: 0.64, most: 0.9 }

/**
 * How much less of its speed momentum may keep over the later half of those
 * spans than over the earlier. It decays evenly, while fingers easing to a stop
 * lose speed ever faster.
 */
const momentumSlack = 0.04

/**
 * The least speed, in px/ms, momentum must set off at to be told from fingers
 * slowing down, which the slower they go are the easier to mistake for it.
 * Safari's sets off about twice as fast as the fingers lifted: at 4 for the
 * gentlest recorded flick, and at 2.4 after a drag.
 */
const momentumSpeed = 1.5

/**
 * How long, in ms, momentum never goes without an event: Safari's are at most
 * 34 ms apart, in its last crawl.
 */
export const momentumGap = 50

/**
 * The speed, in px/ms, down to which momentum sends an event every frame, so
 * that going without one for `momentumGap` means it was cut short.
 */
export const steadySpeed = 0.2

/**
 * How long, in ms, a gesture goes without events before it ends: fingers
 * resting on a trackpad mid-drag send none for up to this long. Shorter once
 * the last events were fast enough to flick, which fingers coming to rest are
 * not, and once momentum has started, whose events keep coming until it stops.
 */
export const gestureEnd = { flicking: 80, momentum: 150, resting: 250 }

/** Add `sample`, forgetting those too old to tell momentum by. */
export function addSample(samples: WheelSample[], sample: WheelSample) {
	samples.push(sample)
	const history = momentumSteps * momentumStep + longestEvent
	while (samples.length > 1 && sample.time - samples[0]!.time > history) {
		samples.shift()
	}
}

/**
 * How fast the events moved the track over the `span` ms up to the last of
 * them, in px/ms toward later slides.
 */
export function speedOver(samples: readonly WheelSample[], span: number): number {
	const last = samples.at(-1)
	return last === undefined ? 0 : movedBetween(samples, last.time - span, last.time) / span
}

/**
 * If the latest events decay as momentum does, the speed it set off at, in
 * px/ms toward later slides, which is how fast the fingers lifted.
 */
export function momentumOnset(samples: readonly WheelSample[]): number | undefined {
	const last = samples.at(-1)
	if (last === undefined) {
		return undefined
	}

	// From the latest span back to the earliest
	const speeds: number[] = []
	for (let step = 0; step < momentumSteps; step++) {
		const end = last.time - step * momentumStep
		const speed = movedBetween(samples, end - momentumStep, end) / momentumStep
		const later = speeds.at(-1)
		// Neither is true of a reversal, or of a span with no events, either
		if (
			later !== undefined &&
			(!(later / speed >= momentumKeeps.least) || !(later / speed <= momentumKeeps.most))
		) {
			return undefined
		}

		speeds.push(speed)
	}

	const half = Math.floor((momentumSteps - 1) / 2)
	const keptLately = speeds[0]! / speeds[half]!
	const keptAtFirst = speeds.at(-1 - half)! / speeds.at(-1)!
	if (keptLately < keptAtFirst - momentumSlack) {
		return undefined
	}

	const onset = speeds.at(-1)!
	return Math.abs(onset) >= momentumSpeed ? onset : undefined
}

/**
 * Whether `sample`, arriving among the momentum events `samples`, comes from
 * fingers on the trackpad again. It reverses, follows a silence, grows out of
 * momentum's last crawl, or is all that is left of momentum that was still
 * fast, none of which momentum does.
 */
export function isFromFingers(samples: readonly WheelSample[], sample: WheelSample): boolean {
	const last = samples.at(-1)
	if (
		last === undefined ||
		Math.sign(sample.delta) !== Math.sign(last.delta) ||
		sample.time - last.time > momentumGap
	) {
		return true
	}

	// Momentum never loses most of its speed within a span, and from its last
	// crawl never gains more than rounding does, a pixel a frame
	const before = Math.abs(movedBetween(samples, last.time - momentumStep, last.time))
	const now = Math.abs(movedBetween([...samples, sample], sample.time - momentumStep, sample.time))
	return before >= steadySpeed * momentumStep
		? now < before * 0.4
		: now > before * 1.5 + momentumStep / frame
}

/**
 * How far the events moved the track between two times, taking each to have
 * moved it evenly since the one before.
 */
function movedBetween(samples: readonly WheelSample[], from: number, to: number): number {
	let moved = 0
	for (const [index, { delta, time }] of samples.entries()) {
		const previous = samples[index - 1]
		const span = previous === undefined ? frame : Math.min(time - previous.time, longestEvent)
		if (span <= 0) {
			// Sent together with the one before
			moved += time > from && time <= to ? delta : 0
			continue
		}

		moved += (delta * Math.max(0, Math.min(time, to) - Math.max(time - span, from))) / span
	}

	return moved
}
