import type { Point, Slide } from './types'
import type { PinchEnding, PinchOutcome, Zoom } from './zoom'
import { controlSelector, isWithin, sealedRegionSelector } from './dom'

type Contact = Point & { isOnMedia: boolean }
type Basis = { anchor: Point; center: Point; distance: number; width: number }
type Sample = Point & { time: number }

/**
 * How far back, in ms, finger travel counts toward the speed a pan is let go
 * at. A flick speeds up until it lifts, so a longer look reads it as slower
 * than it left the screen.
 */
const releaseWindow = 60

/**
 * A pinch owns its remaining fingers until they all lift, including one-finger
 * panning.
 */
export class Pinch {
	#basis: Basis | undefined
	#canPan = false
	readonly #contacts = new Map<number, Contact>()
	#controller: AbortController | undefined
	#frame: number | undefined
	readonly #getSlide: () => Slide | undefined
	#isPinching = false
	#moveTime = 0
	readonly #onClose: () => void
	readonly #onStart: () => void
	#previous: Point | undefined
	readonly #samples: Sample[] = []
	#slide: Slide | undefined
	#travel: Point = { x: 0, y: 0 }
	readonly #zoom: Zoom

	constructor(
		root: HTMLElement,
		zoom: Zoom,
		getSlide: () => Slide | undefined,
		onStart: () => void,
		onClose: () => void,
	) {
		this.#zoom = zoom
		this.#getSlide = getSlide
		this.#onStart = onStart
		this.#onClose = onClose
		root.addEventListener('pointerdown', this.#down, { capture: true })
	}

	/**
	 * Release gesture listeners before closing, resizing, or changing slides,
	 * which cut a held pinch short, or as its fingers lift. Returns what became
	 * of the pinch.
	 */
	stop(ending: PinchEnding = 'interrupt'): PinchOutcome {
		let outcome: PinchOutcome = 'kept'
		this.#zoom.stopPan(this.#isPinching)
		if (this.#frame !== undefined) {
			cancelAnimationFrame(this.#frame)
			this.#frame = undefined
		}

		this.#controller?.abort()
		this.#controller = undefined
		if (this.#isPinching) {
			outcome = this.#zoom.finishPinch(ending)
		}

		this.#contacts.clear()
		this.#basis = undefined
		this.#slide = undefined
		this.#isPinching = false
		this.#samples.length = 0
		this.#previous = undefined
		this.#travel = { x: 0, y: 0 }
		this.#canPan = false
		return outcome
	}

	readonly #down = (event: PointerEvent) => {
		const slide = this.#getSlide()
		if (slide === undefined) {
			return
		}

		const isOnMedia =
			event.composedPath().includes(slide.stage) &&
			!isWithin(event, `${controlSelector},media-controls,[data-popup]`, slide.stage)
		if (event.pointerType !== 'touch') {
			return
		}

		if (this.#contacts.size === 0) {
			if (!isOnMedia || !event.isPrimary) {
				return
			}

			this.#slide = slide
			this.#canPan = !isWithin(event, sealedRegionSelector, slide.stage)
			if (this.#zoom.stopPan(this.#canPan) && this.#canPan) {
				// A press catches the glide; its release must not become a tap.
				this.#onStart()
				this.#isPinching = true
			}

			this.#controller = new AbortController()
			const options = { capture: true, signal: this.#controller.signal }
			document.addEventListener('pointermove', this.#move, options)
			document.addEventListener('pointerup', this.#up, options)
			document.addEventListener('pointercancel', this.#up, options)
		}

		this.#flush()
		this.#contacts.set(event.pointerId, { isOnMedia, x: event.clientX, y: event.clientY })
		if (
			!this.#isPinching &&
			this.#contacts.size === 2 &&
			this.#slide === slide &&
			this.#points() !== undefined
		) {
			this.#onStart()
			this.#isPinching = true
		}

		if (this.#isPinching) {
			event.preventDefault()
			event.stopImmediatePropagation()
		}

		this.#rebase(event.timeStamp)
	}

	readonly #flush = () => {
		if (this.#frame === undefined) {
			return
		}

		cancelAnimationFrame(this.#frame)
		this.#frame = undefined
		const points = this.#points()
		if (points === undefined || this.#basis === undefined || this.#slide === undefined) {
			return
		}

		const scale = this.#basis.distance > 0 ? points.distance / this.#basis.distance : 1
		this.#zoom.pinch(
			this.#slide,
			this.#basis.width * scale,
			this.#basis.anchor,
			points.center,
			this.#contacts.size > 1,
		)
		this.#record(points.center)
	}

	readonly #move = (event: PointerEvent) => {
		if (event.pointerType !== 'touch') {
			return
		}

		const contact = this.#contacts.get(event.pointerId)
		if (contact === undefined) {
			return
		}

		contact.x = event.clientX
		contact.y = event.clientY
		this.#moveTime = event.timeStamp
		if (
			!this.#isPinching &&
			this.#canPan &&
			this.#zoom.current === this.#slide &&
			this.#basis !== undefined &&
			Math.hypot(contact.x - this.#basis.center.x, contact.y - this.#basis.center.y) >= 6
		) {
			this.#onStart()
			this.#isPinching = true
		}

		if (!this.#isPinching) {
			return
		}

		event.preventDefault()
		event.stopImmediatePropagation()
		// Both contacts can move in one input sample. Measure their final pair
		// once per frame so a two-finger pan does not briefly look like a pinch.
		this.#frame ??= requestAnimationFrame(this.#flush)
	}

	#points() {
		const [first, second] = this.#contacts.values()
		if (
			first === undefined ||
			this.#contacts.size > 2 ||
			!first.isOnMedia ||
			second?.isOnMedia === false
		) {
			return
		}

		return {
			center:
				second === undefined ? first : { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
			distance: second === undefined ? 0 : Math.hypot(second.x - first.x, second.y - first.y),
		}
	}

	#rebase(time: number) {
		const points = this.#points()
		const box = this.#slide?.layer.getBoundingClientRect()
		this.#basis =
			points === undefined || box === undefined || box.width <= 0 || box.height <= 0
				? undefined
				: {
						anchor: this.#zoom.anchor(this.#slide!, points.center, this.#contacts.size > 1),
						center: { x: points.center.x, y: points.center.y },
						distance: points.distance,
						width: this.#zoom.gestureWidth(this.#slide!),
					}
		// Changing the finger count changes the midpoint without moving the
		// media. Rebase it without injecting a false velocity into the release.
		this.#previous = points === undefined ? undefined : { x: points.center.x, y: points.center.y }
		if (points === undefined) {
			this.#samples.length = 0
		} else if (this.#samples.length === 0) {
			this.#samples.push({ ...this.#travel, time })
		}
	}

	#record(point: Point) {
		if (this.#previous !== undefined) {
			this.#travel.x += point.x - this.#previous.x
			this.#travel.y += point.y - this.#previous.y
		}

		this.#previous = { x: point.x, y: point.y }
		this.#samples.push({ ...this.#travel, time: this.#moveTime })
		while (this.#samples.length > 2 && this.#samples[1]!.time < this.#moveTime - releaseWindow) {
			this.#samples.shift()
		}
	}

	readonly #up = (event: PointerEvent) => {
		if (event.pointerType !== 'touch' || !this.#contacts.has(event.pointerId)) {
			return
		}

		this.#flush()
		this.#contacts.delete(event.pointerId)
		if (this.#isPinching) {
			event.preventDefault()
			event.stopImmediatePropagation()
		}

		if (event.type === 'pointercancel' || this.#contacts.size === 0) {
			const velocity = this.#velocity(event.timeStamp)
			const wasPinching = this.#isPinching
			const isReleased = event.type === 'pointerup'
			const outcome = this.stop(isReleased ? 'release' : 'cancel')
			if (outcome === 'close') {
				this.#onClose()
			} else if (wasPinching && outcome === 'kept') {
				this.#zoom.fling(isReleased ? velocity : { x: 0, y: 0 })
			}
		} else if (this.#isPinching) {
			this.#rebase(event.timeStamp)
		}
	}

	#velocity(time: number): Point {
		const first = this.#samples[0]
		const last = this.#samples.at(-1)
		if (first === undefined || last === undefined || time - last.time > 80) {
			return { x: 0, y: 0 }
		}

		const elapsed = Math.max(8, Math.min(last.time - first.time, releaseWindow))
		return { x: (last.x - first.x) / elapsed, y: (last.y - first.y) / elapsed }
	}
}
