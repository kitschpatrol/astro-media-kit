/**
 * Telling a trackpad's fingers from the momentum the operating system adds once
 * they lift, from wheel events alone, which say nothing of either. Tuned on
 * Safari's: see `test/fixtures/safari-trackpad-swipes.json`.
 */

/**
 * A wheel event along a track: how far it moves the track, in px toward later
 * slides, and when.
 */
export type WheelSample = { delta: number; time: number }

/**
 * A display frame, in ms: the interval taken to lead up to a gesture's first
 * event.
 */
const frame = 1000 / 60

/**
 * How many events in a row decaying as momentum does mark the fingers as
 * lifted.
 */
const momentumRun = 4

/**
 * How much each momentum event may shrink from the one before. Safari's lose
 * 5-15% each; fingers slowing down shrink them by more, and unevenly.
 */
const momentumDecay = { least: 0.8, most: 1 }

/**
 * The least speed, in px/ms, at which momentum is told apart from fingers
 * slowing down. Below it, whole-pixel deltas decay too coarsely to tell, and
 * the momentum is too slow to matter anyway.
 */
const momentumSpeed = 0.6

/**
 * The span, in ms, a speed is measured over, and how far back the fastest
 * counts.
 */
const speedWindow = 50
const peakWindow = 200

/**
 * How long, in ms, a gesture goes without events before it ends: fingers
 * resting on a trackpad mid-drag send none for up to this long. Shorter once
 * the last events were fast enough to flick, and once momentum has started,
 * whose events keep coming until it stops.
 */
export const gestureEnd = { flicking: 80, momentum: 150, resting: 250 }

/** Add `sample`, forgetting those too old to count toward a speed or momentum. */
export function addSample(samples: WheelSample[], sample: WheelSample) {
	samples.push(sample)
	while (
		samples.length > momentumRun + 1 &&
		sample.time - samples[0]!.time > peakWindow + speedWindow
	) {
		samples.shift()
	}
}

/**
 * If the latest events decay as momentum does, the speed it set off at, in
 * px/ms toward later slides, which is how fast the fingers lifted.
 */
export function momentumOnset(samples: readonly WheelSample[]): number | undefined {
	const start = samples.length - momentumRun - 1
	const first = samples[start]
	const last = samples.at(-1)
	if (first === undefined || last === undefined || first.delta === 0) {
		return undefined
	}

	for (let index = start + 1; index < samples.length; index++) {
		const ratio = samples[index]!.delta / samples[index - 1]!.delta
		if (!(ratio >= momentumDecay.least) || !(ratio <= momentumDecay.most)) {
			return undefined
		}
	}

	// Fingers moving steadily send equal events, which only decay by rounding
	if (last.delta / first.delta > 0.9) {
		return undefined
	}

	const onset = first.delta / intervalBefore(samples, start)
	return Math.abs(onset) >= momentumSpeed ? onset : undefined
}

/**
 * The fastest the track moved over any `speedWindow` in the last `peakWindow`
 * of events, in px/ms toward later slides. Fingers that flick and stop before
 * lifting get no momentum, but did move this fast.
 */
export function recentPeakSpeed(samples: readonly WheelSample[]): number {
	const last = samples.at(-1)
	if (last === undefined) {
		return 0
	}

	let peak = 0
	for (let end = samples.length - 1; end >= 0; end--) {
		const { time } = samples[end]!
		if (last.time - time > peakWindow) {
			break
		}

		let distance = 0
		let span = 0
		for (let index = end; index >= 0 && time - samples[index]!.time < speedWindow; index--) {
			distance += samples[index]!.delta
			span = time - samples[index]!.time + intervalBefore(samples, index)
		}

		const speed = distance / Math.max(span, speedWindow)
		if (Math.abs(speed) > Math.abs(peak)) {
			peak = speed
		}
	}

	return peak
}

/**
 * Whether `delta`, among momentum events, comes from fingers on the trackpad
 * again: it reverses, or grows, which momentum never does.
 */
export function isNewGesture(previous: number, delta: number): boolean {
	return Math.sign(delta) !== Math.sign(previous) || Math.abs(delta) > Math.abs(previous) * 1.5 + 1
}

function intervalBefore(samples: readonly WheelSample[], index: number): number {
	const previous = samples[index - 1]
	return previous === undefined ? frame : Math.max(samples[index]!.time - previous.time, 1)
}
