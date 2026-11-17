import type { Box } from './geometry'
import type { Point, Slide } from './types'
import { lengthOf } from './geometry'

type Axis = { at: number; end?: number; speed: number }
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
		const configured = lengthOf(
			getComputedStyle(stage).getPropertyValue('--amk-lightbox-pan-padding'),
		)
		const padding = Number.isFinite(configured) ? Math.max(0, configured) : 32
		// Preserve the fitted edges so corners stay under the fingers, then add
		// the same persistent padding on every side, independently of zoom.
		this.#bounds = {
			min: {
				x: Math.min(fitted.x, fitted.x + fitted.width - box.width) - padding,
				y: Math.min(fitted.y, fitted.y + fitted.height - box.height) - padding,
			},
			max: {
				x: Math.max(fitted.x, fitted.x + fitted.width - box.width) + padding,
				y: Math.max(fitted.y, fitted.y + fitted.height - box.height) + padding,
			},
		}
		this.#viewport = { x: width, y: height }
		this.#media = { x: box.width, y: box.height }
	}

	/** Move with resistance while held, or clamp a discrete keyboard/wheel step. */
	move(point: Point, elastic = false) {
		const { min, max } = this.#bounds
		this.#draw({
			x: limit(point.x, min.x, max.x, elastic),
			y: limit(point.y, min.y, max.y, elastic),
		})
	}

	/** Undo edge resistance when fingers change, so the next move cannot jump. */
	origin(): Point {
		const { min, max } = this.#bounds
		return {
			x: unlimit(this.#at.x, min.x, max.x),
			y: unlimit(this.#at.y, min.y, max.y),
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
				this.move({ x: x.end ?? x.at, y: y.end ?? y.at })
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

function limit(at: number, min: number, max: number, elastic: boolean): number {
	const bound = Math.min(Math.max(at, min), max)
	// PhotoSwipe's pan resistance: keep following the hand at 35% of its
	// travel beyond an edge, rather than approaching a hard overshoot cap.
	return elastic ? bound + (at - bound) * 0.35 : bound
}

function unlimit(at: number, min: number, max: number): number {
	const bound = Math.min(Math.max(at, min), max)
	return bound + (at - bound) / 0.35
}

function atRest(axis: Axis, min: number, max: number): boolean {
	return (
		Math.abs(axis.speed) < 0.015 &&
		(axis.end === undefined
			? axis.at >= min - 0.5 && axis.at <= max + 0.5
			: Math.abs(axis.at - axis.end) < 0.5)
	)
}

function advance(axis: Axis, min: number, max: number, elapsed: number) {
	const bound = Math.min(Math.max(axis.at, min), max)
	if (axis.end === undefined && bound !== axis.at) {
		axis.end = bound
	}

	if (axis.end === undefined) {
		const decay = Math.exp(-elapsed / 200)
		axis.at += axis.speed * 200 * (1 - decay)
		axis.speed *= decay
	} else {
		// A spring with a small bounce uses PhotoSwipe's edge-return tuning.
		// Retain the target through the small bounce so crossing the edge cannot
		// accidentally restart free momentum. Units here are pixels and ms.
		const distance = axis.at - axis.end
		const damping = 0.82 * 0.012
		const frequency = 0.012 * Math.sqrt(1 - 0.82 ** 2)
		const carry = (axis.speed + damping * distance) / frequency
		const decay = Math.exp(-damping * elapsed)
		const cosine = Math.cos(frequency * elapsed)
		const sine = Math.sin(frequency * elapsed)
		const offset = decay * (distance * cosine + carry * sine)
		axis.at = axis.end + offset
		axis.speed = -damping * offset + decay * frequency * (carry * cosine - distance * sine)
	}
}
