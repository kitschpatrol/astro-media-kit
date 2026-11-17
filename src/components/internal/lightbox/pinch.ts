import type { Point, Slide } from './types'
import type { Zoom } from './zoom'
import { controlSelector, isWithin, sealedRegionSelector } from './dom'

type Contact = Point & { isOnImage: boolean }
type Basis = { anchor: Point; center: Point; distance: number; width: number }
type Sample = Point & { time: number }

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
	) {
		this.#zoom = zoom
		this.#getSlide = getSlide
		this.#onStart = onStart
		root.addEventListener('pointerdown', this.#down, { capture: true })
		root.addEventListener(
			'wheel',
			() => {
				this.#zoom.stopPan()
			},
			{ passive: true },
		)
	}

	/** Release gesture listeners before closing, resizing, or changing slides. */
	stop() {
		this.#zoom.stopPan()
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
		this.#samples.length = 0
		this.#previous = undefined
		this.#travel = { x: 0, y: 0 }
		this.#canPan = false
	}

	readonly #down = (event: PointerEvent) => {
		const slide = this.#getSlide()
		if (slide === undefined) {
			return
		}

		const isOnImage =
			event.composedPath().includes(slide.stage) &&
			!isWithin(event, `${controlSelector},media-controls,[data-popup]`, slide.stage)
		if (event.pointerType !== 'touch') {
			if (isOnImage) {
				this.#zoom.stopPan()
			}

			return
		}

		if (this.#contacts.size === 0) {
			if (!isOnImage || !event.isPrimary) {
				return
			}

			this.#slide = slide
			this.#canPan = !isWithin(event, sealedRegionSelector, slide.stage)
			if (this.#zoom.stopPan()) {
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
		this.#zoom.pinch(this.#slide, this.#basis.width * scale, this.#basis.anchor, points.center)
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

	#rebase(time: number) {
		const points = this.#points()
		const box = this.#slide?.layer.getBoundingClientRect()
		this.#basis =
			points === undefined || box === undefined || box.width <= 0 || box.height <= 0
				? undefined
				: {
						anchor: this.#zoom.anchor(this.#slide!, points.center),
						center: { x: points.center.x, y: points.center.y },
						distance: points.distance,
						width: box.width,
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
		while (this.#samples.length > 2 && this.#samples[1]!.time < this.#moveTime - 100) {
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
			const shouldGlide = this.#isPinching
			this.stop()
			if (shouldGlide) {
				this.#zoom.fling(event.type === 'pointerup' ? velocity : { x: 0, y: 0 })
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

		const elapsed = Math.max(8, Math.min(last.time - first.time, 100))
		return { x: (last.x - first.x) / elapsed, y: (last.y - first.y) / elapsed }
	}
}
