import type { WheelSample } from './wheel'
import {
	controlSelector,
	isPointerClick,
	isWithin,
	regionSelector,
	sealedRegionSelector,
} from './dom'
import { addSample, gestureEnd, isNewGesture, momentumOnset, recentPeakSpeed } from './wheel'

/** Native scrolling, dragging, and glides have one owner at a time. */
type MotionOwner = 'drag' | 'glide' | 'idle' | 'native'

type MotionOptions = {
	canNavigate: () => boolean
	dismissible: () => HTMLElement | undefined
	duration: () => string
	onChange: (index: number) => void
	onDismissEnd: (shouldDismiss: boolean) => void
	onDismissMove: (distance: number) => void
	onPrepare: (index: number) => void
	onRest: () => void
	stage: () => HTMLElement | undefined
}

/**
 * A drag scrolls the track, with mouse, pen, or touch input, or pans a zoomed
 * stage under a mouse. A vertical drag on a fitted image dismisses it.
 */
type Drag = {
	axis: 'dismiss' | 'scroll' | undefined
	canDismiss: boolean
	distanceY: number
	/**
	 * Pressed inside a player or native media controls, which take a longer and
	 * stricter look before a drag starts.
	 */
	isInRegion: boolean
	isTouch: boolean
	/** Pressed where a sideways drag belongs to what was pressed. */
	keepsSideways: boolean
	/**
	 * What the drag moves from, taken once the pointer has moved far enough to
	 * count as a drag, so it catches a glide where it is: the stage's scroll
	 * offset, or the track's position before any rubber banding. Undefined until
	 * then.
	 */
	origin: undefined | { x: number; y: number }
	pointerId: number
	/** Recent track positions, to tell whether it was still moving when let go. */
	samples: Array<{ position: number; time: number }>
	/** The zoomed stage being panned, or undefined for the track. */
	stage: HTMLElement | undefined
	startX: number
	startY: number
}

/**
 * A wheel gesture, from a trackpad's first event to its last momentum one, or a
 * mouse wheel's turn. The track follows it as it does a drag, and it turns at
 * most one slide, as snapping does.
 */
type Wheel = {
	/** How far the gesture has moved the track, before rubber banding. */
	distance: number
	/** Across the track, so the page's or a scroll container's throughout. */
	isAcross: boolean
	/** Let go of the track, which glides on; the momentum left goes unused. */
	isReleased: boolean
	/** The position the gesture moves from, before rubber banding. */
	origin: number
	samples: WheelSample[]
	/** The slide the gesture started from. */
	slide: number
	timer: ReturnType<typeof setTimeout> | undefined
}

/** The track gliding to a slide, a frame at a time. */
type Glide = {
	frame: number
	/** How fast it is moving toward later slides, in px/ms. */
	velocity: number
}

/** How far back, in ms, track positions count toward a drag's speed. */
const flickWindow = 100

/** The speed, in px/ms, at which letting go of a drag goes on to the next slide. */
const flickSpeed = 0.3

/** How hard a drag past either end of the track is held back: iOS's constant. */
const pull = 0.55

/**
 * How close to a slide, in px, the track counts as resting on it. Browsers
 * round a fractional snap position to whole or device pixels when they report
 * it.
 */
const onSlide = 1

/**
 * How far from its slide, in px, a glide still moves visibly, for a press to
 * catch it. A press on one nearly there is a press on what is showing.
 */
const catchDistance = 2

/**
 * Captions keep mouse presses, for selecting their text: the viewer's, and a
 * page carousel's.
 */
const captionSelector = '.amk-lightbox-caption,.amk-carousel-slide figcaption'

/** Whether the click being dispatched, or the next one, ends a drag. */
let isDragClick = false

/**
 * Whether a click ends a drag of a track, for listeners elsewhere, such as the
 * lightbox's on the document, to let it be.
 */
export function isClickFromDrag(): boolean {
	return isDragClick
}

/** Owns the carousel's input, snapping, spring, and cancellation lifecycle. */
export class CarouselMotion {
	get direction(): number {
		return this.#direction
	}
	get index(): number {
		return this.#indexFromScroll()
	}
	/** The slide being navigated to, or else the current one. */
	get target(): number {
		return this.#target ?? this.#index
	}
	readonly #controller = new AbortController()
	#count = 0
	#direction = 1
	#drag: Drag | undefined
	#glide: Glide | undefined
	#index = 0
	/** Whether the press now underway reached the track, if one is. */
	#isPressSeen = false
	#isTouching = false
	readonly #options: MotionOptions
	#overflow = 0
	#owner: MotionOwner = 'idle'
	#realignTimer: ReturnType<typeof setTimeout> | undefined
	#shouldIgnoreClick = false
	#target: number | undefined

	readonly #track: HTMLElement

	#wheel: undefined | Wheel
	#width = 0
	get #position(): number {
		return Math.abs(this.#track.scrollLeft) + this.#overflow
	}
	constructor(track: HTMLElement, options: MotionOptions) {
		this.#track = track
		this.#options = options
		const { signal } = this.#controller
		// On the document, since the click that ends a drag can land on an
		// ancestor of the track when the pointer was let go over another element
		document.addEventListener('click', this.#handleClick, { capture: true, signal })
		document.addEventListener('pointerdown', this.#handleNextPress, { capture: true, signal })
		track.addEventListener('pointerdown', this.#handlePointerdown, { signal })
		track.addEventListener('pointermove', this.#handlePointermove, { signal })
		track.addEventListener('pointerup', this.#handlePointerEnd, { signal })
		track.addEventListener('pointercancel', this.#handlePointerEnd, { signal })
		track.addEventListener('lostpointercapture', this.#handlePointerEnd, { signal })
		track.addEventListener('scroll', this.#handleScroll, { passive: true, signal })
		track.addEventListener('scrollend', this.#realign, { signal })
		track.addEventListener('touchstart', this.#handleTouchstart, { passive: true, signal })
		track.addEventListener('touchend', this.#handleTouchEnd, { passive: true, signal })
		track.addEventListener('touchcancel', this.#handleTouchEnd, { passive: true, signal })
		track.addEventListener('wheel', this.#handleWheel, { passive: false, signal })
	}

	configure(count: number, index: number) {
		this.stop()
		this.#count = count
		this.#index = index
		this.#width = trackWidth(this.#track)
		this.#direction = getComputedStyle(this.#track).direction === 'rtl' ? -1 : 1
		this.render(index * this.#width)
	}

	/** Stop and release every listener before the track is removed or reused. */
	destroy() {
		this.#controller.abort()
		this.stop()
		if (this.#shouldIgnoreClick) {
			this.#ignoreClick(false)
		}
	}

	/**
	 * Glide to a slide, starting at `velocity` (in px/ms toward later slides), or
	 * jump there. Repeated calls before it arrives keep counting from it, and
	 * keep its momentum.
	 */
	go(
		index: number,
		behavior: 'instant' | 'smooth' = 'smooth',
		velocity = this.#glide?.velocity ?? 0,
	) {
		if (this.#isTouching) {
			return
		}

		this.#cancelDrag()
		this.#target = clamp(index, this.#count)
		this.#options.onPrepare(this.#target)
		if (behavior === 'instant') {
			this.#stopGlide()
			this.render(this.#target * this.#width)
			this.#rest()
		} else {
			this.#glideTo(this.#target * this.#width, velocity)
		}
	}

	/**
	 * Show the track at `position` (see `#position`), drawing any part past
	 * either end as an offset, since it can't scroll there.
	 */
	render(position: number) {
		const inside = Math.min(Math.max(position, 0), (this.#count - 1) * this.#width)
		this.#overflow = position - inside
		this.#track.scrollLeft = inside * this.#direction
		this.#track.style.translate =
			this.#overflow === 0 ? '' : `${-this.#overflow * this.#direction}px`
	}

	resize(width: number) {
		this.stop()
		this.#width = width
	}

	/** Step from the slide being navigated to, or else from the current one. */
	step(delta: number) {
		this.go((this.#target ?? this.#index) + delta)
	}

	stop() {
		this.#stopGlide()
		this.#cancelDrag()
		this.#dropWheel()
		clearTimeout(this.#realignTimer)
		this.#realignTimer = undefined
		this.#target = undefined
		this.#overflow = 0
		this.#isTouching = false
		this.#owner = 'idle'
		this.#track.style.translate = ''
		delete this.#track.dataset.moving
	}

	/**
	 * Decide what a press that has moved far enough drags: the subject away to
	 * dismiss it, the track, or a zoomed stage. Returns where the drag moves
	 * from, or undefined while it is still a press or once the browser takes it.
	 */
	#begin(drag: Drag, event: PointerEvent, distanceX: number, distanceY: number): Drag['origin'] {
		// A player gets a longer and stricter look, so its own drags stay its own.
		// A touch moving mostly up or down is decided as soon, for the page
		const distance = Math.hypot(
			distanceX,
			drag.canDismiss || drag.stage !== undefined || drag.isTouch ? distanceY : 0,
		)
		if (distance < (drag.isInRegion ? 12 : 6)) {
			return
		}

		const steepness = drag.isInRegion ? 2 : 1
		if (drag.canDismiss && Math.abs(distanceY) > steepness * Math.abs(distanceX)) {
			drag.axis = 'dismiss'
			drag.origin = { x: 0, y: 0 }
			// Keep the press timestamp so a flick with a single move still has
			// a measurable velocity when released in the same frame.
			drag.samples[0]!.position = 0
			this.#track.setPointerCapture(event.pointerId)
		} else if (drag.keepsSideways || (drag.isTouch && Math.abs(distanceY) > Math.abs(distanceX))) {
			// What was pressed keeps any other drag, and the browser scrolls the page,
			// or a caption, under a mostly vertical swipe
			this.#cancelDrag()
			return
		} else if (drag.stage === undefined) {
			return this.#grab(drag, event.pointerId)
		} else {
			drag.origin = { x: drag.stage.scrollLeft, y: drag.stage.scrollTop }
		}

		this.#owner = 'drag'
		;(drag.stage ?? this.#track).dataset.dragging = ''
		return drag.origin
	}

	#cancelDrag() {
		const drag = this.#drag
		this.#drag = undefined
		if (drag === undefined) {
			return
		}

		this.#ignoreClick(drag.origin !== undefined)
		delete (drag.stage ?? this.#track).dataset.dragging
		if (this.#owner === 'drag') {
			this.#owner = 'idle'
		}

		if (drag.axis === 'dismiss') {
			this.#options.onDismissEnd(false)
		}

		if (this.#track.hasPointerCapture(drag.pointerId)) {
			this.#track.releasePointerCapture(drag.pointerId)
		}
	}

	/**
	 * Whether a press on the current subject can start a vertical drag to dismiss
	 * it: not while zoomed, or while the track is between slides.
	 */
	#canDismiss(event: PointerEvent, stage: HTMLElement | undefined): boolean {
		const dismissible = this.#options.dismissible()
		return (
			stage === undefined &&
			dismissible !== undefined &&
			this.#glide === undefined &&
			Math.abs(this.#position - this.#index * this.#width) < onSlide &&
			event.composedPath().includes(dismissible)
		)
	}

	/** Forget the wheel gesture underway, if any, where it has got to. */
	#dropWheel() {
		clearTimeout(this.#wheel?.timer)
		this.#wheel = undefined
	}

	/**
	 * End `drag`: let go, cancelled by the browser, or its capture lost. Only a
	 * release carries its speed on, and only the click after a loss or a release
	 * is the drag's own.
	 */
	#end(drag: Drag, outcome: 'cancel' | 'loss' | 'release', time: number) {
		this.#drag = undefined
		// A press that never moved far enough is a click
		if (drag.origin === undefined) {
			return
		}

		const isRelease = outcome === 'release'
		delete (drag.stage ?? this.#track).dataset.dragging
		this.#owner = 'idle'
		if (drag.axis === 'dismiss') {
			const velocity = velocityOf(drag.samples, drag.distanceY, time)
			const distance = Math.abs(drag.distanceY)
			const threshold = Math.min(160, this.#track.clientHeight * 0.2)
			this.#ignoreClick(outcome !== 'cancel')
			this.#options.onDismissEnd(
				isRelease &&
					(distance >= threshold ||
						(distance >= 40 && Math.abs(velocity) > 0.5 && velocity * drag.distanceY > 0)),
			)
			return
		}

		if (drag.stage === undefined) {
			// The finger has lifted, though touchend has yet to say so
			if (isRelease) {
				this.#isTouching = false
			}

			this.#settle(isRelease ? velocityOf(drag.samples, this.#position, time) : 0)
		}

		// The click that ends a drag is not a click on the content. None follows
		// a drag the browser cancelled, so the next click is a click again
		this.#ignoreClick(outcome !== 'cancel')
	}

	/**
	 * A press a player kept has no capture, so a mouse let go over one of the
	 * viewer's buttons beside the track sends no pointerup here. The move after
	 * it, with no button held, ends the press, or the drag, as cancelled, before
	 * that move could start dragging.
	 */
	#endUnreleased(event: PointerEvent) {
		const drag = this.#drag
		if (drag?.pointerId !== event.pointerId || drag.isTouch) {
			return
		}

		this.#end(drag, 'cancel', event.timeStamp)
	}

	/**
	 * End the wheel gesture underway, if any: one still following the fingers
	 * lets go at the speed they last flicked at.
	 */
	readonly #endWheel = () => {
		const wheel = this.#wheel
		if (wheel === undefined) {
			return
		}

		clearTimeout(wheel.timer)
		this.#wheel = undefined
		if (wheel.isAcross || wheel.isReleased) {
			return
		}

		const speed = recentPeakSpeed(wheel.samples)
		this.#releaseWheel(wheel, speed)
		if (!(Math.abs(speed) > flickSpeed)) {
			return
		}

		// Events held up while the page was busy may yet arrive, the end of
		// the same flick, which would otherwise start over and settle back
		this.#wheel = wheel
		wheel.timer = setTimeout(this.#endWheel, gestureEnd.momentum)
	}

	/**
	 * Move the track `delta` further with the fingers, within a slide either side
	 * of where the gesture started, and let go once momentum takes over.
	 */
	#followWheel(wheel: Wheel, delta: number) {
		wheel.distance += delta
		const least = Math.max(wheel.slide - 1, 0) * this.#width
		const most = Math.min(wheel.slide + 1, this.#count - 1) * this.#width
		this.render(mapPast(wheel.origin + wheel.distance, least, most, this.#width, rubberBand))
		const onset = momentumOnset(wheel.samples)
		if (onset !== undefined) {
			this.#releaseWheel(wheel, onset)
		}
	}

	/**
	 * Animate the track to `position` on a critically damped spring, rather than
	 * scrolling smoothly, which browsers make instant when the system turns off
	 * scroll animation, and which can't start at a drag's speed. Uses the
	 * carousel duration, which is instant with reduced motion. Never overshoots:
	 * a launch faster than the spring allows stiffens it instead.
	 */
	#glideTo(position: number, velocity: number) {
		this.#stopGlide()
		const durations = this.#options.duration()
		// eslint-disable-next-line unicorn/prefer-number-coercion -- Number() can't read past the unit
		const duration = Number.parseFloat(durations) * 1000
		const distance = this.#position - position
		if (Number.isNaN(duration) || duration <= 0 || Math.abs(distance) < 0.5) {
			this.render(position)
			this.#rest()
			return
		}

		const towardSpeed = -Math.sign(distance) * velocity
		const stiffness = Math.max(8 / duration, towardSpeed / Math.abs(distance))
		const sway = velocity + stiffness * distance
		let start: number | undefined
		const glide: Glide = { frame: 0, velocity }
		const step = (time: number) => {
			// The first frame already shows the glide a frame along, so it moves on
			// straight away rather than holding still for one frame
			start ??= time - 1000 / 60
			const elapsed = time - start
			const decay = Math.exp(-stiffness * elapsed)
			const offset = (distance + sway * elapsed) * decay
			if (Math.abs(offset) < 0.5) {
				this.#glide = undefined
				this.render(position)
				this.#rest()
				return
			}

			this.render(position + offset)
			glide.velocity = (sway - stiffness * (distance + sway * elapsed)) * decay
			glide.frame = requestAnimationFrame(step)
		}

		// Snapping would pull every position in between back to a slide
		this.#track.dataset.moving = ''
		glide.frame = requestAnimationFrame(step)
		this.#glide = glide
		this.#owner = 'glide'
	}

	/**
	 * Take the track for `drag` wherever it has got to, from any glide underway,
	 * and return where the drag moves it from.
	 */
	#grab(drag: Drag, pointerId: number): Drag['origin'] {
		// Touch initially captures on what was pressed
		this.#track.setPointerCapture(pointerId)
		this.#stopGlide()
		this.#target = undefined
		drag.axis = 'scroll'
		drag.origin = { x: this.#mapPastEnds(this.#position, rubberBandDistance), y: 0 }
		this.#owner = 'drag'
		this.#track.dataset.dragging = ''
		// Snapping would pull every position in between back to a slide
		this.#track.dataset.moving = ''
		return drag.origin
	}

	/** The click that ends a drag is not a click on anything. */
	readonly #handleClick = (event: MouseEvent) => {
		if (!this.#shouldIgnoreClick) {
			return
		}

		// A touch drag ends without a click, so a key or a script may click next
		if (!isPointerClick(event)) {
			this.#ignoreClick(false)
			return
		}

		this.#shouldIgnoreClick = false
		event.preventDefault()
		event.stopPropagation()
		// Listeners on the document still see the click; they read the flag
		queueMicrotask(() => {
			isDragClick = false
		})
	}

	/**
	 * A drag's click follows its release at once. A touch drag has none, so a
	 * press anywhere means the next click is a click again.
	 */
	readonly #handleNextPress = () => {
		if (this.#shouldIgnoreClick) {
			this.#ignoreClick(false)
		}
	}

	readonly #handlePointerdown = (event: PointerEvent) => {
		this.#isPressSeen = true
		// A press during a wheel gesture lets go of it, and may catch its glide
		this.#endWheel()
		if (!event.isPrimary) {
			this.#cancelDrag()
			return
		}

		if (event.button === 0) {
			this.#press(event)
		}
	}

	readonly #handlePointerEnd = (event: PointerEvent) => {
		// Touch initially captures on the image. Transferring that capture to
		// the track emits a bubbling loss from the image, not a canceled drag.
		if (event.type === 'lostpointercapture' && event.target !== this.#track) {
			return
		}

		const drag = this.#drag
		if (drag?.pointerId !== event.pointerId) {
			return
		}

		this.#end(
			drag,
			event.type === 'pointerup' ? 'release' : event.type === 'pointercancel' ? 'cancel' : 'loss',
			event.timeStamp,
		)
	}

	readonly #handlePointermove = (event: PointerEvent) => {
		if (event.buttons === 0) {
			this.#isPressSeen = false
			this.#endUnreleased(event)
		} else if (
			this.#drag === undefined &&
			!this.#isPressSeen &&
			event.buttons === 1 &&
			event.target instanceof HTMLMediaElement &&
			event.target.controls
		) {
			// Firefox's native media controls keep the press itself, so a drag
			// starts from its first move instead
			this.#isPressSeen = true
			this.#press(event)
		}

		const drag = this.#drag
		if (drag?.pointerId !== event.pointerId) {
			return
		}

		const distanceX = event.clientX - drag.startX
		const distanceY = event.clientY - drag.startY
		const origin = drag.origin ?? this.#begin(drag, event, distanceX, distanceY)
		if (origin === undefined) {
			return
		}

		if (drag.axis === 'dismiss') {
			drag.distanceY = distanceY
			drag.samples.push({ position: distanceY, time: event.timeStamp })
			while (event.timeStamp - (drag.samples[0]?.time ?? event.timeStamp) > flickWindow) {
				drag.samples.shift()
			}

			this.#options.onDismissMove(distanceY)
		} else if (drag.stage === undefined) {
			const position = this.#mapPastEnds(origin.x - distanceX * this.#direction, rubberBand)
			this.render(position)
			drag.samples.push({ position, time: event.timeStamp })
			while (event.timeStamp - (drag.samples[0]?.time ?? event.timeStamp) > flickWindow) {
				drag.samples.shift()
			}
		} else {
			drag.stage.scrollTo({
				behavior: 'instant',
				left: origin.x - distanceX,
				top: origin.y - distanceY,
			})
		}
	}

	readonly #handleScroll = () => {
		if (this.#realignTimer !== undefined) {
			this.#scheduleRealign()
		}

		// Skip while a resize is pending: the offset is still for the old width
		if (!this.#options.canNavigate() || this.#width === 0 || this.#isResizePending()) {
			return
		}

		// Have the neighbors ready as soon as the track moves off the current
		// slide (but not for the jump to it when opening)
		if (Math.abs(Math.abs(this.#track.scrollLeft) - this.#index * this.#width) >= onSlide) {
			this.#options.onPrepare(this.#index)
		}

		this.#setIndex(this.#indexFromScroll())
	}

	readonly #handleTouchEnd = (event: TouchEvent) => {
		this.#isTouching = event.touches.length > 0
		this.#scheduleRealign()
	}

	/**
	 * A touch the track leaves to the browser, such as a pinch or a press on a
	 * control, takes over from any navigation underway. A glide it interrupts
	 * leaves the track between slides with snapping off, so the realign settles
	 * it once the touch lifts.
	 */
	readonly #handleTouchstart = (event: TouchEvent) => {
		if (!this.#options.canNavigate()) {
			return
		}

		this.#isTouching = true
		// Pointerdown precedes touchstart, so a lone finger the track took as a
		// possible drag, or caught it with, is already its own
		if (event.touches.length === 1 && this.#drag?.isTouch) {
			return
		}

		this.#stopGlide()
		this.#cancelDrag()
		this.#dropWheel()
		this.#target = undefined
		this.#owner = 'native'
		// Clear synthetic overshoot before the browser takes over scrolling.
		if (this.#overflow !== 0) {
			this.render(Math.min(Math.max(this.#position, 0), (this.#count - 1) * this.#width))
		}
	}

	/**
	 * A wheel along the track moves it as a drag does: a trackpad's fingers move
	 * it, and it carries on from the speed they lift at, which only the momentum
	 * events after that show. A gesture across the track is the page's, or a
	 * zoomed stage's, throughout. A mouse wheel's lines or pages step a slide.
	 */
	readonly #handleWheel = (event: WheelEvent) => {
		const stage = this.#options.stage()
		if (
			!this.#options.canNavigate() ||
			this.#width === 0 ||
			event.ctrlKey ||
			(stage !== undefined && event.composedPath().includes(stage))
		) {
			return
		}

		const isAlong = isAlongTrack(event)
		const delta = wheelAlong(event) * this.#direction
		if (this.#drag?.origin !== undefined || event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
			if (isAlong) {
				event.preventDefault()
				// A drag underway keeps the track, and a mouse wheel's notches step
				if (this.#drag?.origin === undefined) {
					this.step(Math.sign(delta))
				}
			}

			return
		}

		const wheel = this.#wheelFor(isAlong, delta)
		if (!wheel.isAcross) {
			event.preventDefault()
			if (delta !== 0) {
				addSample(wheel.samples, { delta, time: event.timeStamp })
				if (!wheel.isReleased) {
					this.#followWheel(wheel, delta)
				}
			}
		}

		clearTimeout(wheel.timer)
		wheel.timer = setTimeout(this.#endWheel, pauseBeforeEnd(wheel))
	}

	/** Remember that the next click ends a drag, for everyone to let it be. */
	#ignoreClick(value: boolean) {
		this.#shouldIgnoreClick = value
		isDragClick = value
	}

	#indexFromScroll(): number {
		return this.#width === 0
			? this.#index
			: clamp(Math.round(Math.abs(this.#track.scrollLeft) / this.#width), this.#count)
	}

	/**
	 * Whether the track has a new width that `resize` has yet to hear of: its
	 * scroll offset is for the new width by then, but `#width` isn't.
	 */
	#isResizePending(): boolean {
		return Math.abs(this.#track.clientWidth - this.#width) >= 1
	}

	/**
	 * Map the part of a track position past either end through `map`, keeping the
	 * part within the track.
	 */
	#mapPastEnds(position: number, map: (distance: number, size: number) => number): number {
		return mapPast(position, 0, (this.#count - 1) * this.#width, this.#width, map)
	}

	/**
	 * Take a primary press as a possible drag, unless something else owns it. A
	 * press on the gliding track catches it where it is, as on iOS: a drag goes
	 * on from there, and letting go settles it on the nearest slide.
	 */
	#press(event: PointerEvent) {
		// A zoomed stage pans instead of the track scrolling
		const stage = this.#options.stage()
		const canDismiss = this.#canDismiss(event, stage)
		const isTouch = event.pointerType !== 'mouse'
		const isCatch =
			this.#glide !== undefined &&
			stage === undefined &&
			Math.abs(this.#position - this.target * this.#width) >= catchDistance
		const isInRegion = isWithin(event, regionSelector, this.#track)
		// A player keeps sideways mouse drags, which may be its own, but passes
		// sideways touch swipes on to the track, unless they may be for native
		// controls or an embed that can't be seen into
		const keepsSideways =
			isInRegion && (!isTouch || isWithin(event, sealedRegionSelector, this.#track))
		if (
			!this.#options.canNavigate() ||
			isKeptByTarget(event, this.#track, stage) ||
			(!canDismiss && !isCatch && keepsSideways)
		) {
			return
		}

		// Chrome would otherwise take the press as the start of dragging an image
		// out of the page or selecting text, and stop sending this drag. That also
		// skips moving focus, so move it as the press would have. A player keeps
		// its press, focus included
		if (!isTouch && !isInRegion) {
			event.preventDefault()
			const pressed = event.target instanceof Element ? event.target : this.#track
			;(pressed.closest<HTMLElement>('.amk-lightbox-stage') ?? this.#track).focus({
				preventScroll: true,
			})
		}

		this.#drag = {
			axis: undefined,
			canDismiss,
			distanceY: 0,
			isInRegion,
			isTouch,
			keepsSideways,
			origin: undefined,
			pointerId: event.pointerId,
			samples: [{ position: this.#position, time: event.timeStamp }],
			stage,
			startX: event.clientX,
			startY: event.clientY,
		}
		if (isCatch) {
			// Captured, so a player under the press never takes its release as a tap
			this.#grab(this.#drag, event.pointerId)
		} else if (!isTouch && !isInRegion) {
			// Keep receiving the drag when it passes over the controls, or leaves
			// the track. The click that follows a press then lands on the track
			this.#track.setPointerCapture(event.pointerId)
		}
	}

	/**
	 * Once a scroll the browser ran has settled, glide on to the nearest slide if
	 * it left the track between slides, as interrupting a glide can. A drag or a
	 * glide holds the track itself until it rests, however long it pauses.
	 */
	readonly #realign = (event?: Event) => {
		if (event !== undefined && event.target !== this.#track) {
			return
		}

		// Ignore scrollend queued by the cancelled spring until native input is quiet.
		if (event !== undefined && this.#realignTimer !== undefined) {
			return
		}

		clearTimeout(this.#realignTimer)
		this.#realignTimer = undefined
		if (
			this.#isTouching ||
			this.#owner === 'drag' ||
			this.#owner === 'glide' ||
			this.#width === 0 ||
			this.#isResizePending() ||
			!this.#options.canNavigate()
		) {
			return
		}

		const index = this.#indexFromScroll()
		if (this.#owner === 'native') {
			// Restore snapping only after native input has settled, and let the
			// browser finish any remaining distance with its own scrolling behavior.
			delete this.#track.dataset.moving
			if (Math.abs(this.#position - index * this.#width) >= onSlide) {
				this.#track.scrollTo({
					behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
					left: index * this.#width * this.#direction,
				})
				return
			}
		} else if (Math.abs(this.#position - index * this.#width) >= onSlide) {
			this.go(index)
			return
		}

		this.#rest()
	}

	/**
	 * Let the track go from a wheel gesture at `velocity`, to a slide next to
	 * where it started.
	 */
	#releaseWheel(wheel: Wheel, velocity: number) {
		wheel.isReleased = true
		this.#owner = 'idle'
		this.#settle(velocity, wheel.slide - 1, wheel.slide + 1)
	}

	#rest() {
		this.#setIndex(this.#indexFromScroll())
		this.#target = undefined
		this.#owner = 'idle'
		delete this.#track.dataset.moving
		this.#options.onRest()
	}

	readonly #scheduleRealign = () => {
		clearTimeout(this.#realignTimer)
		this.#realignTimer = setTimeout(this.#realign, 150)
	}

	#setIndex(index: number) {
		if (index === this.#index) {
			return
		}

		this.#index = index
		this.#options.onChange(index)
	}

	/**
	 * Glide on from a release at `velocity`, in px/ms toward later slides, to a
	 * slide from `least` to `most`. Let go while still moving, the track carries
	 * on to the next slide that way, as paging does on iOS: a quick short swipe
	 * advances, and swinging back cancels. Let go at rest, it settles on the
	 * nearest slide. Either way it glides there from the speed it was let go at.
	 */
	#settle(velocity: number, least = 0, most = this.#count - 1) {
		const slides = this.#position / this.#width
		const index =
			velocity > flickSpeed
				? Math.floor(slides) + 1
				: velocity < -flickSpeed
					? Math.ceil(slides) - 1
					: Math.round(slides)
		this.go(Math.min(Math.max(index, least), most), 'smooth', velocity)
	}

	/**
	 * Begin a wheel gesture, across the track, or along it from wherever the
	 * track has got to, catching any glide underway as a press does.
	 */
	#startWheel(isAcross: boolean): Wheel {
		const slide = clamp(Math.round(this.#position / this.#width), this.#count)
		const wheel: Wheel = {
			distance: 0,
			isAcross,
			isReleased: false,
			origin: 0,
			samples: [],
			slide,
			timer: undefined,
		}
		this.#wheel = wheel
		if (isAcross) {
			return wheel
		}

		this.#stopGlide()
		this.#target = undefined
		const least = Math.max(slide - 1, 0) * this.#width
		const most = Math.min(slide + 1, this.#count - 1) * this.#width
		wheel.origin = mapPast(this.#position, least, most, this.#width, rubberBandDistance)
		this.#owner = 'drag'
		// Snapping would pull every position in between back to a slide
		this.#track.dataset.moving = ''
		return wheel
	}

	#stopGlide() {
		if (this.#glide === undefined) {
			return
		}

		cancelAnimationFrame(this.#glide.frame)
		this.#glide = undefined
	}

	/**
	 * The wheel gesture an event belongs to, begun anew for the first, and for
	 * one momentum can't have sent once let go: one across the track, since
	 * momentum runs straight along it, or one that reverses or grows, from
	 * fingers back on the trackpad, which catch the glide where it is.
	 */
	#wheelFor(isAlong: boolean, delta: number): Wheel {
		const wheel = this.#wheel
		const previous = wheel?.samples.at(-1)?.delta
		const isResumed = delta !== 0 && previous !== undefined && isNewGesture(previous, delta)
		if (wheel !== undefined && (!wheel.isReleased || (isAlong && !isResumed))) {
			return wheel
		}

		clearTimeout(wheel?.timer)
		return this.#startWheel(!isAlong)
	}
}

/**
 * A track's width as laid out, which is how far apart its slides rest. It is
 * fractional in a fluid column or a zoomed page, where `clientWidth` rounds it,
 * and offsets counted in rounded widths drift from the slides.
 */
export function trackWidth(track: HTMLElement): number {
	// eslint-disable-next-line unicorn/prefer-number-coercion -- Number() can't read past the unit
	const width = Number.parseFloat(getComputedStyle(track).width)
	// Not laid out, or sized by its border box: the rounded width has to do
	return Math.abs(width - track.clientWidth) < 1 ? width : track.clientWidth
}

function clamp(index: number, count: number): number {
	return Math.min(Math.max(index, 0), count - 1)
}

/**
 * Whether a wheel moves mostly along the track, as a shifted vertical one does.
 * A tie goes across, to leave a page's scrolling alone.
 */
function isAlongTrack(event: WheelEvent): boolean {
	const y = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY
	return Math.abs(wheelAlong(event)) > Math.abs(y)
}

/**
 * Whether a press belongs to what it landed on, whatever the track is doing: a
 * control, a caption's text under a mouse, or a zoomed stage's scrollbar. The
 * browser pans a zoomed stage under touch.
 */
function isKeptByTarget(
	event: PointerEvent,
	track: HTMLElement,
	stage: HTMLElement | undefined,
): boolean {
	const isTouch = event.pointerType !== 'mouse'
	return (
		isWithin(event, controlSelector, track) ||
		// Touch selects text with a long press, not a drag
		(!isTouch && isWithin(event, captionSelector, track)) ||
		(stage !== undefined && (isTouch || (event.target === stage && isOnScrollbar(event, stage))))
	)
}

/**
 * How long, in ms, a wheel gesture goes without events before it ends: briefly
 * after momentum, or after fingers flicking, and longer after slow ones, which
 * may only be resting.
 */
function pauseBeforeEnd(wheel: Wheel): number {
	if (wheel.isAcross || wheel.isReleased) {
		return gestureEnd.momentum
	}

	return Math.abs(recentPeakSpeed(wheel.samples)) > flickSpeed
		? gestureEnd.flicking
		: gestureEnd.resting
}

/**
 * Map the part of a track position past `least` or `most` through `map`, for a
 * track `size` wide, keeping the part between them.
 */
function mapPast(
	position: number,
	least: number,
	most: number,
	size: number,
	map: (distance: number, size: number) => number,
): number {
	const inside = Math.min(Math.max(position, least), most)
	const beyond = position - inside
	return inside + Math.sign(beyond) * map(Math.abs(beyond), size)
}

/** Whether a press landed on one of `element`'s own scrollbars. */
function isOnScrollbar(event: PointerEvent, element: HTMLElement): boolean {
	const box = element.getBoundingClientRect()
	const x = event.clientX - box.left - element.clientLeft
	const y = event.clientY - box.top - element.clientTop
	return x < 0 || y < 0 || x >= element.clientWidth || y >= element.clientHeight
}

/**
 * How far content dragged `distance` past an end of a track `size` wide moves:
 * less and less the further it goes, never quite reaching `size`, as on iOS.
 */
function rubberBand(distance: number, size: number): number {
	return (1 - 1 / ((distance * pull) / size + 1)) * size
}

/** How far a drag past an end must go to move content `offset`. */
function rubberBandDistance(offset: number, size: number): number {
	return (offset * size) / (pull * (size - offset))
}

/**
 * How far a wheel moves along the track, in px: a shifted vertical one moves it
 * too.
 */
function wheelAlong(event: WheelEvent): number {
	return event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX
}

/**
 * The track's speed in px/ms toward later slides over the `flickWindow` before
 * it reached `position` at `time`, or 0 if it was at rest for all of it.
 */
function velocityOf(
	samples: Array<{ position: number; time: number }>,
	position: number,
	time: number,
): number {
	const recent = samples.find((sample) => time - sample.time <= flickWindow)
	return recent === undefined || recent.time === time
		? 0
		: (position - recent.position) / (time - recent.time)
}
