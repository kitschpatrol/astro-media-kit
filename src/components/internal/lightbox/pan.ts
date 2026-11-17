import type { Box } from './geometry'
import type { Axis, Bounds } from './pan-math'
import type { Point, Slide } from './types'
import { lengthOf } from './geometry'
import { advance, atRest, launch, limit, limitsOf, unlimit } from './pan-math'

/** How long, in ms, a released pan may go on before it is put to rest. */
const longestRelease = 1800

/** How a position past the limits is treated. */
export type Resistance = 'clamp' | 'elastic' | 'free'

/** Translation, edge resistance, and release motion for one enlarged subject. */
export class Pan {
	/** Where the subject's top-left corner is drawn in its stage. */
	get at(): Point {
		return { ...this.#at }
	}
	get center(): Point {
		return {
			x: (this.#viewport.x / 2 - this.#at.x) / this.#media.x,
			y: (this.#viewport.y / 2 - this.#at.y) / this.#media.y,
		}
	}
	/** Where the stage's top-left corner was in the viewport when measured. */
	get stage(): Point {
		return { ...this.#stage }
	}
	#at: Point = { x: 0, y: 0 }
	#bounds: Bounds = { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }
	#frame: number | undefined
	#media: Point = { x: 0, y: 0 }
	#padding = 32
	readonly #slide: Slide
	#stage: Point = { x: 0, y: 0 }

	#viewport: Point = { x: 0, y: 0 }

	constructor(slide: Slide) {
		this.#slide = slide
	}

	/** The nearest position within the limits. */
	bound(point: Point): Point {
		const { min, max } = this.#bounds
		return { x: limit(point.x, min.x, max.x, false), y: limit(point.y, min.y, max.y, false) }
	}

	/**
	 * Read the stage's box and the pan padding. Both hold through a gesture, so
	 * read them as one begins or the viewport changes, never for each move: a
	 * read among a move's writes has the browser lay the subject out twice a
	 * frame.
	 */
	measure() {
		const { stage } = this.#slide
		const box = stage.getBoundingClientRect()
		const configured = lengthOf(
			getComputedStyle(stage).getPropertyValue('--amk-lightbox-pan-padding'),
		)
		this.#padding = Number.isFinite(configured) ? Math.max(0, configured) : 32
		this.#stage = { x: box.x, y: box.y }
		this.#viewport = { x: box.width, y: box.height }
	}

	/**
	 * Move within the limits, as a keyboard or wheel step does; with resistance
	 * past them, as under one held finger; or freely, as under a pinch.
	 */
	move(point: Point, resistance: Resistance = 'clamp') {
		const { min, max } = this.#bounds
		this.#draw(
			resistance === 'free'
				? point
				: {
						x: limit(point.x, min.x, max.x, resistance === 'elastic'),
						y: limit(point.y, min.y, max.y, resistance === 'elastic'),
					},
		)
	}

	/**
	 * The position an elastic move would draw here: undo edge resistance when
	 * fingers change, so the next move cannot jump.
	 */
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

		const speed = launch(velocity)
		const x: Axis = { at: this.#at.x, speed: speed.x }
		const y: Axis = { at: this.#at.y, speed: speed.y }
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
				time - start >= longestRelease ||
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

	/**
	 * Set the limits for a subject of `size`, from the stage as last measured,
	 * without reading the page.
	 */
	setLimits(fitted: Box, size: Point) {
		this.#media = size
		this.#bounds = limitsOf(fitted, size, this.#viewport, this.#padding)
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
