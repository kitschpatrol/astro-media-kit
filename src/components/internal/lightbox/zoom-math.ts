/**
 * The sizes a held subject takes, apart from the page: how far a pinch is
 * followed past the smallest and largest widths, when shrinking closes the
 * viewer instead, and how a size let go past a limit returns to it. The tuning
 * is PhotoSwipe's.
 */

/** The widths a subject settles between: its fitted layout, and its largest. */
export type ZoomLimits = { fit: number; maximum: number }

/** How much of a pinch past the largest size the subject follows. */
const upperFriction = 0.05
/** How far past its largest size a subject stretches at most, as a share of it. */
const upperReach = 0.1
/** How much of a pinch below fit an enlarged subject follows. */
const lowerFriction = 0.15
/** How far past fit a pinch that started fitted can grow and still close. */
const closeAllowance = 1 / 15
/** The share of fit over which a pinch to close dims the viewer fully. */
const fadeSpan = 1 / 1.2
/** Below any size fingers can hold, and clear of dividing by zero. */
const smallestShare = 0.1
/** A critically damped spring's frequency, per millisecond. */
const settleFrequency = 0.04

/**
 * The largest width a subject fitted at `fit` can be held at: `zoom` times it,
 * or a preset zoom's width when that is larger still.
 */
export function maximumWidth(fit: number, zoom: number, preset = 0): number {
	return Math.max(fit * zoom, preset)
}

/**
 * The width drawn for fingers asking for `width`. Between the limits it is
 * theirs. Below fit it follows a share of their travel, and past the maximum a
 * smaller share that fades out, never stretching past `upperReach`.
 */
export function resist(width: number, { fit, maximum }: ZoomLimits): number {
	if (width < fit) {
		return fit + (width - fit) * lowerFriction
	}

	if (width > maximum) {
		const distance = (width - maximum) * upperFriction
		return maximum + distance / (1 + distance / (maximum * upperReach))
	}

	return width
}

/**
 * The width fingers would be asking for where `width` is drawn: `resist`
 * undone, so that a pinch picks up where the subject is held or caught.
 */
export function requestedWidth(width: number, { fit, maximum }: ZoomLimits): number {
	if (width < fit) {
		return Math.max(0, fit + (width - fit) / lowerFriction)
	}

	if (width > maximum) {
		const distance = width - maximum
		return (
			maximum + distance / (upperFriction * Math.max(0.01, 1 - distance / (maximum * upperReach)))
		)
	}

	return width
}

/**
 * Whether a pinch that began on the fitted subject has grown far enough that
 * shrinking it again resists, rather than closing the viewer.
 */
export function isPastClosing(width: number, fit: number): boolean {
	return width > fit * (1 + closeAllowance)
}

/**
 * A pinch to close, below fit: the subject follows the fingers as they are,
 * down to a smallest size, and the viewer dims to `fade` of its opacity.
 */
export function shrink(width: number, fit: number): { fade: number; width: number } {
	const held = Math.max(width, fit * smallestShare)
	return { fade: Math.max(0, 1 - (fit - held) / (fit * fadeSpan)), width: held }
}

/** The width a subject let go at `width` settles to. */
export function settledWidth(width: number, { fit, maximum }: ZoomLimits): number {
	return Math.min(Math.max(width, fit), maximum)
}

/**
 * How much of the way to its settled place a subject still has to go, `elapsed`
 * ms after it was let go: from 1 down toward 0, without overshoot.
 */
export function settleRemaining(elapsed: number): number {
	const turn = Math.max(0, elapsed) * settleFrequency
	return (1 + turn) * Math.exp(-turn)
}
