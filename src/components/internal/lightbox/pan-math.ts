import type { Box } from './geometry'
import type { Point } from './types'

/**
 * Where an enlarged subject can rest, how it gives past that under a finger,
 * and how it coasts and springs back once let go, apart from the page.
 */

/** One axis of a released pan: where it is, how fast, and where it must end. */
export type Axis = { at: number; end?: number; speed: number }

/** The positions a subject's top-left corner can rest between. */
export type Bounds = { min: Point; max: Point }

/**
 * How long, in ms, a released pan takes to lose all but a third of its speed:
 * it coasts as far as it would travel in this time at the speed it was let go.
 * PhotoSwipe's 200 feels heavy under a finger, and an iOS scroll view's 500
 * would carry a small flick across the whole subject.
 */
const coastTime = 325
/**
 * How much of a pull past an edge the subject follows: PhotoSwipe's pan
 * resistance, which keeps giving way rather than approaching a hard stop.
 */
const edgeResistance = 0.35
/** The speed, in px/ms, below which letting go does not coast. */
const slowestCoast = 0.08
/** The fastest, in px/ms, a coast sets off. */
const fastestCoast = 3
/** The speed, in px/ms, below which a released pan has come to rest. */
const restSpeed = 0.015
// PhotoSwipe's edge return: a spring with a small bounce, in px and ms.
const springDamping = 0.82
const springFrequency = 0.012

/**
 * The limits for a subject of `size` in a `viewport`, as PhotoSwipe sets them:
 * an edge that can reach the viewport's `padding` stops there, with the same
 * padding on every side. An axis too short to reach both stays centered where
 * the `fitted` subject is, so zooming in from the fitted layout never jumps.
 */
export function limitsOf(fitted: Box, size: Point, viewport: Point, padding: number): Bounds {
	const centered = {
		x: fitted.x + (fitted.width - size.x) / 2,
		y: fitted.y + (fitted.height - size.y) / 2,
	}
	return {
		min: {
			x: Math.min(centered.x, viewport.x - padding - size.x),
			y: Math.min(centered.y, viewport.y - padding - size.y),
		},
		max: {
			x: Math.max(centered.x, padding),
			y: Math.max(centered.y, padding),
		},
	}
}

/**
 * Where a subject asked to be at `at` is drawn: within its limits, or, when
 * `elastic`, a share of the way past one.
 */
export function limit(at: number, min: number, max: number, elastic: boolean): number {
	const bound = Math.min(Math.max(at, min), max)
	return elastic ? bound + (at - bound) * edgeResistance : bound
}

/** Where a subject drawn at `at` was asked to be: an elastic `limit` undone. */
export function unlimit(at: number, min: number, max: number): number {
	const bound = Math.min(Math.max(at, min), max)
	return bound + (at - bound) / edgeResistance
}

/**
 * The velocity a pan let go at `velocity` coasts off with: none below a resting
 * hand's drift, and no faster than a hard flick.
 */
export function launch(velocity: Point): Point {
	const speed = Math.hypot(velocity.x, velocity.y)
	const factor = speed < slowestCoast ? 0 : Math.min(1, fastestCoast / speed)
	return { x: velocity.x * factor, y: velocity.y * factor }
}

/** Whether a released axis has stopped where it may stay. */
export function atRest(axis: Axis, min: number, max: number): boolean {
	return (
		Math.abs(axis.speed) < restSpeed &&
		(axis.end === undefined
			? axis.at >= min - 0.5 && axis.at <= max + 0.5
			: Math.abs(axis.at - axis.end) < 0.5)
	)
}

/**
 * Move a released axis on by `elapsed` ms: coasting within its limits, and
 * springing to the one it has passed. The target is kept through the spring's
 * small bounce, so crossing the edge again cannot restart the coast.
 */
export function advance(axis: Axis, min: number, max: number, elapsed: number) {
	const bound = Math.min(Math.max(axis.at, min), max)
	if (axis.end === undefined && bound !== axis.at) {
		axis.end = bound
	}

	if (axis.end === undefined) {
		const decay = Math.exp(-elapsed / coastTime)
		axis.at += axis.speed * coastTime * (1 - decay)
		axis.speed *= decay
		return
	}

	const distance = axis.at - axis.end
	const damping = springDamping * springFrequency
	const frequency = springFrequency * Math.sqrt(1 - springDamping ** 2)
	const carry = (axis.speed + damping * distance) / frequency
	const decay = Math.exp(-damping * elapsed)
	const cosine = Math.cos(frequency * elapsed)
	const sine = Math.sin(frequency * elapsed)
	const offset = decay * (distance * cosine + carry * sine)
	axis.at = axis.end + offset
	axis.speed = -damping * offset + decay * frequency * (carry * cosine - distance * sine)
}
