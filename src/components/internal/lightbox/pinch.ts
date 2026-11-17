import type { Point, Slide } from './types'
import type { Zoom } from './zoom'

type Contact = Point & { isOnImage: boolean }
type Basis = { anchor: Point; distance: number; width: number }

/**
 * A pinch owns its remaining fingers until they all lift, including one-finger
 * panning.
 */
export class Pinch {
	#basis: Basis | undefined
	readonly #contacts = new Map<number, Contact>()
	#controller: AbortController | undefined
	#frame: number | undefined
	readonly #getSlide: () => Slide | undefined
	#isPinching = false
	readonly #onStart: () => void
	#slide: Slide | undefined
	readonly #zoom: Zoom

	constructor(
		root: HTMLElement,
		zoom: Zoom,
		getSlide: () => Slide | undefined,
		onStart: () => void,
	) {
		this.#zoom = zoom
		this.#getSlide = getSlide
		this.#onStart = onStart
		root.addEventListener('pointerdown', this.#down, { capture: true })
	}

	/** Release gesture listeners before closing, resizing, or changing slides. */
	stop() {
		if (this.#frame !== undefined) {
			cancelAnimationFrame(this.#frame)
			this.#frame = undefined
		}

		this.#controller?.abort()
		this.#controller = undefined
		if (this.#isPinching) {
			this.#zoom.finishPinch()
		}

		this.#contacts.clear()
		this.#basis = undefined
		this.#slide = undefined
		this.#isPinching = false
	}

	readonly #down = (event: PointerEvent) => {
		if (event.pointerType !== 'touch') {
			return
		}

		const slide = this.#getSlide()
		if (slide === undefined) {
			return
		}

		const isOnImage = event.composedPath().includes(slide.stage)
		if (this.#contacts.size === 0) {
			if (!isOnImage || !event.isPrimary) {
				return
			}

			this.#slide = slide
			this.#controller = new AbortController()
			const options = { capture: true, signal: this.#controller.signal }
			document.addEventListener('pointermove', this.#move, options)
			document.addEventListener('pointerup', this.#up, options)
			document.addEventListener('pointercancel', this.#up, options)
		}

		this.#flush()
		this.#contacts.set(event.pointerId, { isOnImage, x: event.clientX, y: event.clientY })
		if (
			!this.#isPinching &&
			this.#contacts.size === 2 &&
			this.#slide === slide &&
			this.#points() !== undefined
		) {
			this.#onStart()
			this.#isPinching = true
		}

		if (!this.#isPinching) {
			return
		}

		event.preventDefault()
		event.stopImmediatePropagation()
		this.#rebase()
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
		this.#zoom.pinch(this.#slide, this.#basis.width * scale, this.#basis.anchor, points.center)
	}

	readonly #move = (event: PointerEvent) => {
		const contact = this.#contacts.get(event.pointerId)
		if (contact === undefined) {
			return
		}

		contact.x = event.clientX
		contact.y = event.clientY
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
			!first.isOnImage ||
			second?.isOnImage === false
		) {
			return
		}

		return {
			center:
				second === undefined ? first : { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
			distance: second === undefined ? 0 : Math.hypot(second.x - first.x, second.y - first.y),
		}
	}

	#rebase() {
		const points = this.#points()
		const box = this.#slide?.layer.getBoundingClientRect()
		this.#basis =
			points === undefined || box === undefined || box.width <= 0 || box.height <= 0
				? undefined
				: {
						anchor: {
							x: (points.center.x - box.x) / box.width,
							y: (points.center.y - box.y) / box.height,
						},
						distance: points.distance,
						width: box.width,
					}
	}

	readonly #up = (event: PointerEvent) => {
		if (!this.#contacts.has(event.pointerId)) {
			return
		}

		this.#flush()
		this.#contacts.delete(event.pointerId)
		if (this.#isPinching) {
			event.preventDefault()
			event.stopImmediatePropagation()
		}

		if (event.type === 'pointercancel' || this.#contacts.size === 0) {
			this.stop()
		} else if (this.#isPinching) {
			this.#rebase()
		}
	}
}
