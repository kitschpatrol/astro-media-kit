import type { Point, Slide } from './types'
import type { HoldEnding, HoldOutcome, Zoom } from './zoom'
import {
	controlSelector,
	isOnPlayerSurface,
	isWithin,
	regionSelector,
	sealedRegionSelector,
} from './dom'

type Contact = Point & { isOnMedia: boolean }
type Basis = { anchor: Point; center: Point; distance: number; width: number }
type Sample = Point & { time: number }

type GestureOptions = {
	/** Whether two fingers resize a slide's subject, rather than only move it. */
	canPinch: (slide: Slide) => boolean
	/** A pinch that shrank the fitted subject was let go, to close the viewer. */
	onClose: () => void
	/**
	 * The gesture has taken its pointers: nothing else drags with them, and no
	 * click follows their release.
	 */
	onStart: () => void
	/** The slide whose subject can be held, once the viewer is open. */
	slide: () => Slide | undefined
}

/**
 * How far back, in ms, pointer travel counts toward the speed a pan is let go
 * at. A flick speeds up until it lifts, so a longer look reads it as slower
 * than it left the screen.
 */
const releaseWindow = 60

/**
 * How long, in ms, a pointer can rest before it lifts and still coast. Longer,
 * and it had stopped: the pan stays where it was let go.
 */
const longestRest = 80

/** How far, in px, a single pointer moves before it pans rather than presses. */
const dragDistance = 6

/** How long, in ms, after its last step a wheel or trackpad zoom is let go. */
const stepRest = 150

/**
 * The most one wheel event zooms, in hundredths of its exponent. A trackpad
 * pinch arrives in steps far smaller; a notch of a mouse wheel is far larger,
 * and would otherwise nearly triple the subject.
 */
const largestStep = 25

/**
 * Holds the current slide's subject under fingers, a mouse, or a pen. Two
 * fingers pinch and move it; one finger, or a pressed mouse or pen, pans it
 * while it is enlarged, the same way whichever it is. A gesture owns its
 * pointers until they have all lifted. A trackpad pinch, or a wheel turned with
 * Ctrl or Command held, zooms it in steps about the pointer.
 */
export class SubjectGesture {
	#basis: Basis | undefined
	#canPan = false
	#canPinch = false
	readonly #contacts = new Map<number, Contact>()
	#controller: AbortController | undefined
	#frame: number | undefined
	/** Whether the gesture has taken its pointers, to pinch or to pan. */
	#isHolding = false
	#isTouch = false
	#moveTime = 0
	readonly #options: GestureOptions
	/** The pointer that began the gesture, which a mouse or a pen captures. */
	#pointerId = 0
	#previous: Point | undefined
	readonly #samples: Sample[] = []
	#slide: Slide | undefined
	/** The scale Safari last reported for the trackpad pinch under way. */
	#stepScale = 1
	/** Counts down to the end of a run of wheel or trackpad zoom steps. */
	#stepTimer: ReturnType<typeof setTimeout> | undefined
	#travel: Point = { x: 0, y: 0 }
	readonly #zoom: Zoom

	constructor(root: HTMLElement, zoom: Zoom, options: GestureOptions) {
		this.#zoom = zoom
		this.#options = options
		root.addEventListener('pointerdown', this.#down, { capture: true })
		root.addEventListener('wheel', this.#wheel, { capture: true, passive: false })
		for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
			root.addEventListener(type, this.#trackpadPinch, { capture: true })
		}
	}

	/**
	 * Release gesture listeners before closing, resizing, or changing slides,
	 * which cut a held gesture short, or as its pointers lift. Returns what
	 * became of the hold.
	 */
	stop(ending: HoldEnding = 'interrupt'): HoldOutcome {
		let outcome: HoldOutcome = 'kept'
		this.#zoom.stopPan(this.#isHolding)
		if (this.#frame !== undefined) {
			cancelAnimationFrame(this.#frame)
			this.#frame = undefined
		}

		this.#controller?.abort()
		this.#controller = undefined
		const isStepping = this.#stepTimer !== undefined
		clearTimeout(this.#stepTimer)
		this.#stepTimer = undefined
		if (isStepping || this.#isHolding) {
			outcome = this.#zoom.release(ending)
		}

		const stage = this.#slide?.stage
		if (stage !== undefined && !this.#isTouch) {
			delete stage.dataset.dragging
			if (stage.hasPointerCapture(this.#pointerId)) {
				stage.releasePointerCapture(this.#pointerId)
			}
		}

		this.#contacts.clear()
		this.#basis = undefined
		this.#slide = undefined
		this.#isHolding = false
		this.#samples.length = 0
		this.#previous = undefined
		this.#travel = { x: 0, y: 0 }
		this.#canPan = false
		this.#canPinch = false
		return outcome
	}

	/** Place the subject under the contacts as they are now. */
	#apply() {
		const points = this.#points()
		if (points === undefined || this.#basis === undefined || this.#slide === undefined) {
			return
		}

		// Two fingers only move a subject that doesn't pinch
		const scale =
			this.#canPinch && this.#basis.distance > 0 ? points.distance / this.#basis.distance : 1
		this.#zoom.hold(
			this.#slide,
			this.#basis.width * scale,
			this.#basis.anchor,
			points.center,
			this.#contacts.size > 1 ? 'free' : 'elastic',
		)
		this.#record(points.center)
	}

	/** The contact an event moves or lifts, if it is one of this gesture's. */
	#contactOf(event: PointerEvent): Contact | undefined {
		return (event.pointerType === 'touch') === this.#isTouch
			? this.#contacts.get(event.pointerId)
			: undefined
	}

	readonly #down = (event: PointerEvent) => {
		const slide = this.#options.slide()
		if (slide === undefined) {
			return
		}

		const isTouch = event.pointerType === 'touch'
		const isOnMedia = isOverSubject(event, slide)
		if (this.#contacts.size === 0) {
			// A press ends a run of wheel or trackpad zoom steps where it is
			this.#stepsDone()
			if (!isOnMedia || !event.isPrimary || event.button !== 0 || !this.#start(event, slide)) {
				return
			}
		} else if (!isTouch || !this.#isTouch) {
			// A mouse or a pen holds alone, and fingers ignore every other pointer
			return
		}

		this.#flush()
		this.#contacts.set(event.pointerId, { isOnMedia, x: event.clientX, y: event.clientY })
		if (
			!this.#isHolding &&
			this.#contacts.size === 2 &&
			this.#slide === slide &&
			this.#points() !== undefined
		) {
			this.#hold()
		}

		if (this.#isHolding) {
			event.preventDefault()
			event.stopImmediatePropagation()
		}

		this.#rebase(event.timeStamp)
	}

	/** Apply a pair of moves still waiting for their frame, ahead of it. */
	readonly #flush = () => {
		if (this.#frame === undefined) {
			return
		}

		cancelAnimationFrame(this.#frame)
		this.#frame = undefined
		this.#apply()
	}

	/**
	 * Take the gesture's pointers. A mouse or a pen is captured by the stage,
	 * whose grabbing cursor then shows wherever the drag goes.
	 */
	#hold() {
		this.#options.onStart()
		this.#isHolding = true
		const stage = this.#slide?.stage
		if (stage === undefined || this.#isTouch) {
			return
		}

		stage.dataset.dragging = ''
		stage.setPointerCapture(this.#pointerId)
	}

	readonly #move = (event: PointerEvent) => {
		const contact = this.#contactOf(event)
		if (contact === undefined) {
			return
		}

		contact.x = event.clientX
		contact.y = event.clientY
		this.#moveTime = event.timeStamp
		if (
			!this.#isHolding &&
			this.#canPan &&
			this.#zoom.current === this.#slide &&
			this.#basis !== undefined &&
			Math.hypot(contact.x - this.#basis.center.x, contact.y - this.#basis.center.y) >= dragDistance
		) {
			this.#hold()
		}

		if (!this.#isHolding) {
			return
		}

		event.preventDefault()
		event.stopImmediatePropagation()
		if (this.#contacts.size === 1) {
			// A single pointer is followed as it moves. Waiting for a frame adds
			// nothing, and trails the finger wherever the browser holds frames
			// back, as Safari does in Low Power Mode.
			this.#flush()
			this.#apply()
			return
		}

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
		const hold =
			points === undefined || this.#slide === undefined
				? undefined
				: this.#zoom.grasp(this.#slide, points.center, this.#contacts.size > 1 ? 'free' : 'elastic')
		this.#basis =
			points === undefined || hold === undefined
				? undefined
				: {
						anchor: hold.anchor,
						center: { x: points.center.x, y: points.center.y },
						distance: points.distance,
						width: hold.width,
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

	/**
	 * Begin a gesture with its first pointer, and say whether it did. Fingers
	 * begin on anything that pinches or is enlarged. A mouse or a pen begins only
	 * on an enlarged subject it can pan: fitted, its drags are the track's.
	 */
	#start(event: PointerEvent, slide: Slide): boolean {
		const isTouch = event.pointerType === 'touch'
		const isZoomed = this.#zoom.current === slide
		const canPinch = this.#options.canPinch(slide)
		const isInRegion = isWithin(event, regionSelector, slide.stage)
		// Native controls and embeds keep a single pointer, which may be for a
		// control of theirs that can't be seen. A player keeps a mouse on its
		// controls, and passes one on its surface on, as it does every finger
		const canPan =
			!isWithin(event, sealedRegionSelector, slide.stage) &&
			(isTouch || !isInRegion || isOnPlayerSurface(event, slide.stage))
		if (isTouch ? !isZoomed && !canPinch : !isZoomed || !canPan) {
			return false
		}

		this.#slide = slide
		this.#isTouch = isTouch
		this.#pointerId = event.pointerId
		this.#canPinch = canPinch
		this.#canPan = canPan
		// Chrome would otherwise take a mouse press as the start of dragging an
		// image out of the page or selecting text, and stop sending this drag.
		// That also skips moving focus, so move it as the press would have. A
		// player keeps its press, focus included
		if (!isTouch && !isInRegion) {
			event.preventDefault()
			slide.stage.focus({ preventScroll: true })
		}

		this.#controller = new AbortController()
		const options = { capture: true, signal: this.#controller.signal }
		document.addEventListener('pointermove', this.#move, options)
		document.addEventListener('pointerup', this.#up, options)
		document.addEventListener('pointercancel', this.#up, options)
		if (!isTouch) {
			document.addEventListener('lostpointercapture', this.#up, options)
		}

		// A press catches a glide where it is, and its release must not become
		// a tap. One that can't pan lets a settling pinch land instead
		const wasMoving = this.#zoom.stopPan(canPan)
		if (wasMoving && canPan) {
			this.#hold()
		}

		return true
	}

	/**
	 * Zoom by one step of a wheel or trackpad run, and let go once it rests: the
	 * layout, with the image's resolution, then catches up with the size
	 * reached.
	 */
	#step(slide: Slide, factor: number, point: Point) {
		clearTimeout(this.#stepTimer)
		this.#zoom.zoomBy(slide, factor, point)
		this.#stepTimer = setTimeout(this.#stepsDone, stepRest)
	}

	readonly #stepsDone = () => {
		if (this.#stepTimer === undefined) {
			return
		}

		if (this.stop('release') === 'kept') {
			this.#zoom.coast()
		}
	}

	/** The slide a wheel or trackpad zoom over `event` resizes, if any. */
	#stepSlide(event: Event): Slide | undefined {
		const slide = this.#options.slide()
		return slide !== undefined &&
			this.#contacts.size === 0 &&
			this.#options.canPinch(slide) &&
			isOverSubject(event, slide)
			? slide
			: undefined
	}

	/**
	 * Safari reports a trackpad pinch in events of its own, with the scale since
	 * it began. It sends them for fingers on a touchscreen too, which are already
	 * being followed as pointers.
	 */
	readonly #trackpadPinch = (event: Event) => {
		const slide = this.#stepSlide(event)
		if (slide === undefined) {
			return
		}

		// Otherwise Safari zooms the page under the viewer
		event.preventDefault()
		// No standard describes these events, so no type does either
		const { clientX, clientY, scale } = event as Event & {
			clientX: number
			clientY: number
			scale: number
		}
		if (event.type === 'gesturestart') {
			this.#stepScale = 1
		} else if (event.type === 'gestureend') {
			this.#stepsDone()
		} else if (scale > 0) {
			this.#step(slide, scale / this.#stepScale, { x: clientX, y: clientY })
			this.#stepScale = scale
		}
	}

	readonly #up = (event: PointerEvent) => {
		// A pen captured by what it pressed gives that up as the stage captures
		// it, which is no loss of the drag
		if (
			this.#contactOf(event) === undefined ||
			(event.type === 'lostpointercapture' && event.target !== this.#slide?.stage)
		) {
			return
		}

		this.#flush()
		this.#contacts.delete(event.pointerId)
		if (this.#isHolding) {
			event.preventDefault()
			event.stopImmediatePropagation()
		}

		const isReleased = event.type === 'pointerup'
		if (!isReleased || this.#contacts.size === 0) {
			const velocity = this.#velocity(event.timeStamp)
			const wasHolding = this.#isHolding
			const outcome = this.stop(isReleased ? 'release' : 'cancel')
			if (outcome === 'close') {
				this.#options.onClose()
			} else if (wasHolding && outcome === 'kept') {
				this.#zoom.coast(isReleased ? velocity : { x: 0, y: 0 })
			}
		} else if (this.#isHolding) {
			this.#rebase(event.timeStamp)
		}
	}

	#velocity(time: number): Point {
		const first = this.#samples[0]
		const last = this.#samples.at(-1)
		if (first === undefined || last === undefined || time - last.time > longestRest) {
			return { x: 0, y: 0 }
		}

		const elapsed = Math.max(8, Math.min(last.time - first.time, releaseWindow))
		return { x: (last.x - first.x) / elapsed, y: (last.y - first.y) / elapsed }
	}

	/**
	 * Other browsers report a trackpad pinch as a wheel turned with Ctrl held,
	 * which is also how a mouse asks to zoom, as is Command on a Mac. A plain
	 * wheel pans an enlarged subject, and is otherwise left alone, to turn
	 * slides.
	 */
	readonly #wheel = (event: WheelEvent) => {
		if (event.ctrlKey || event.metaKey) {
			const slide = this.#stepSlide(event)
			if (slide === undefined) {
				return
			}

			// Otherwise the browser zooms the page under the viewer
			event.preventDefault()
			event.stopPropagation()
			const unit = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 1 : 16
			const step = Math.max(-largestStep, Math.min(largestStep, event.deltaY * unit))
			this.#step(slide, Math.exp(-step / 100), { x: event.clientX, y: event.clientY })
			return
		}

		const slide = this.#options.slide()
		if (slide === undefined || this.#zoom.current !== slide || !isOverSubject(event, slide)) {
			return
		}

		// Shift turns a wheel that only goes up and down sideways
		event.preventDefault()
		const unit =
			event.deltaMode === WheelEvent.DOM_DELTA_LINE
				? 16
				: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
					? slide.stage.clientHeight
					: 1
		const isTurned = event.shiftKey && event.deltaX === 0
		this.#zoom.panBy({
			x: (isTurned ? event.deltaY : event.deltaX) * unit,
			y: (isTurned ? 0 : event.deltaY) * unit,
		})
	}
}

/**
 * Whether an event is on a slide's subject, or the space its stage gives it,
 * rather than on a control or a popup of the subject's own.
 */
function isOverSubject(event: Event, slide: Slide): boolean {
	return (
		event.composedPath().includes(slide.stage) &&
		!isWithin(event, `${controlSelector},media-controls,[data-popup]`, slide.stage)
	)
}
