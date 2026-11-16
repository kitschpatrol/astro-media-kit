/**
 * Wheel events of [ms since the first, deltaX, deltaY], as the recorded swipes
 * are.
 */
export type WheelEvents = Array<[time: number, deltaX: number, deltaY: number]>

const frame = 1000 / 60

/**
 * The events of fingers that never lift: speeding up over the first `peak` of
 * `duration` ms and easing to a stop over the rest, `distance` px in all, as a
 * trackpad sends them, in whole pixels each frame.
 */
export function easedScroll(duration: number, distance: number, peak: number): WheelEvents {
	const speedAt = (time: number) => {
		const rise = peak * duration
		const along = (time - rise) / (time < rise ? rise : duration - rise)
		return (1 - along * along) ** 2
	}

	const count = Math.round(duration / frame)
	const speeds = Array.from({ length: count }, (_value, index) => speedAt((index + 0.5) * frame))
	const total = speeds.reduce((sum, speed) => sum + speed, 0)
	const events: WheelEvents = []
	let owed = 0
	for (const [index, speed] of speeds.entries()) {
		owed += (speed / total) * distance
		const delta = Math.round(owed)
		owed -= delta
		if (delta !== 0) {
			events.push([Math.round((index + 1) * frame), delta, 0])
		}
	}

	return events
}
