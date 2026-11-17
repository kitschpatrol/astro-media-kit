import type { Box } from './geometry'
import type { Point, Slide } from './types'

type Axis = { at: number; speed: number }
type Bounds = { min: Point; max: Point }

/** Translation, edge resistance, and release motion for one enlarged subject. */
export class Pan {
	get center(): Point {
		return {
			x: (this.#viewport.x / 2 - this.#at.x) / this.#media.x,
			y: (this.#viewport.y / 2 - this.#at.y) / this.#media.y,
		}
	}
	/** Scroll-like coordinates used by mouse dragging and keyboard movement. */
	get position(): Point {
		return { x: -this.#at.x, y: -this.#at.y }
	}
	#at: Point = { x: 0, y: 0 }
	#bounds: Bounds = { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }
	#frame: number | undefined
	#media: Point = { x: 0, y: 0 }
	#room: Point = { x: 0, y: 0 }
	readonly #slide: Slide

	#viewport: Point = { x: 0, y: 0 }

	constructor(slide: Slide) {
		this.#slide = slide
	}

	/** Measure only when the viewport or media size changes, never during a glide. */
	measure(fitted: Box) {
		const { frame, stage } = this.#slide
		const width = stage.clientWidth
		const height = stage.clientHeight
		const box = frame.getBoundingClientRect()
		// Preserve the fitted image's edges, so a corner can stay under the
		// fingers without introducing additional empty space around the media.
		this.#bounds = {
			min: { x: fitted.x + fitted.width - box.width, y: fitted.y + fitted.height - box.height },
			max: { x: fitted.x, y: fitted.y },
		}
		this.#viewport = { x: width, y: height }
		this.#media = { x: box.width, y: box.height }
		this.#room = { x: Math.min(96, width * 0.15), y: Math.min(96, height * 0.15) }
	}

	/** Move with resistance while held, or clamp a discrete keyboard/wheel step. */
	move(point: Point, elastic = false) {
		const { min, max } = this.#bounds
		this.#draw({
			x: limit(point.x, min.x, max.x, elastic ? this.#room.x : 0),
			y: limit(point.y, min.y, max.y, elastic ? this.#room.y : 0),
		})
	}

	/** Undo edge resistance when fingers change, so the next move cannot jump. */
	origin(): Point {
		const { min, max } = this.#bounds
		return {
			x: unlimit(this.#at.x, min.x, max.x, this.#room.x),
			y: unlimit(this.#at.y, min.y, max.y, this.#room.y),
		}
	}

	/** Coast inside the bounds and spring back when released outside them. */
	release(velocity?: Point) {
		velocity ??= { x: 0, y: 0 }
		this.stop()
		const reduced = matchMedia('(prefers-reduced-motion: reduce)')
		if (reduced.matches) {
			this.move(this.#at)
			return
		}

		const speed = Math.hypot(velocity.x, velocity.y)
		const factor = speed < 0.08 ? 0 : Math.min(1, 3 / speed)
		const x: Axis = { at: this.#at.x, speed: velocity.x * factor }
		const y: Axis = { at: this.#at.y, speed: velocity.y * factor }
		const { min, max } = this.#bounds
		if (atRest(x, min.x, max.x) && atRest(y, min.y, max.y)) {
			this.move(this.#at)
			return
		}

		let previous = performance.now()
		const start = previous
		const step = (time: number) => {
			const elapsed = Math.min(time - previous, 32)
			previous = time
			advance(x, min.x, max.x, elapsed)
			advance(y, min.y, max.y, elapsed)
			const done =
				reduced.matches ||
				time - start >= 1800 ||
				(atRest(x, min.x, max.x) && atRest(y, min.y, max.y))
			if (done) {
				this.move({ x: x.at, y: y.at })
				this.stop()
			} else {
				this.#draw({ x: x.at, y: y.at })
				this.#frame = requestAnimationFrame(step)
			}
		}

		this.#slide.stage.dataset.panning = ''
		this.#frame = requestAnimationFrame(step)
	}

	/** Catch at the displayed position; a new press must not finish the glide. */
	stop(): boolean {
		const wasMoving = this.#frame !== undefined
		if (this.#frame !== undefined) {
			cancelAnimationFrame(this.#frame)
			this.#frame = undefined
		}

		delete this.#slide.stage.dataset.panning
		return wasMoving
	}

	#draw(point: Point) {
		this.#at = point
		this.#slide.frame.style.translate = `${point.x}px ${point.y}px`
	}
}

function limit(at: number, min: number, max: number, room: number): number {
	const bound = Math.min(Math.max(at, min), max)
	const distance = at - bound
	return room === 0 ? bound : bound + (distance * 0.55) / (1 + (Math.abs(distance) * 0.55) / room)
}

function unlimit(at: number, min: number, max: number, room: number): number {
	const bound = Math.min(Math.max(at, min), max)
	const distance = at - bound
	return bound + distance / (0.55 * Math.max(0.01, 1 - Math.abs(distance) / room))
}

function atRest(axis: Axis, min: number, max: number): boolean {
	return Math.abs(axis.speed) < 0.015 && axis.at >= min - 0.5 && axis.at <= max + 0.5
}

function advance(axis: Axis, min: number, max: number, elapsed: number) {
	const bound = Math.min(Math.max(axis.at, min), max)
	if (bound === axis.at) {
		const decay = Math.exp(-elapsed / 240)
		axis.at += axis.speed * 240 * (1 - decay)
		axis.speed *= decay
	} else {
		// An analytic, critically damped spring retains the release velocity and
		// settles without frame-rate-dependent oscillation or an abrupt stop.
		const distance = axis.at - bound
		const spring = 0.018
		const carry = axis.speed + spring * distance
		const decay = Math.exp(-spring * elapsed)
		axis.at = bound + (distance + carry * elapsed) * decay
		axis.speed = (axis.speed - spring * carry * elapsed) * decay
	}
}
