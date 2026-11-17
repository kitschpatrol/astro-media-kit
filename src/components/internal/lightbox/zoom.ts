import type { Box } from './geometry'
import type { Resistance } from './pan'
import type { Point, Slide } from './types'
import { identity, layerStyle, setLayerStyle } from './animation'
import { controlSelector, isWithin } from './dom'
import { refreshImagePreview } from './image-preview'
import { Pan } from './pan'
import { prepareSlideImage } from './prepare'

/**
 * How a pinch ended: its fingers lifted, the browser took them away, or
 * something else, such as closing or a resize, cut it short.
 */
export type PinchEnding = 'cancel' | 'interrupt' | 'release'

/**
 * What ending a pinch led to: the viewer should close, the subject stays as it
 * is held and may coast, or it is settling back within its limits.
 */
export type PinchOutcome = 'close' | 'kept' | 'settling'

type ZoomOptions = {
	/** The zoomed slide, or whether it counts as enlarged, changed. */
	onChange: () => void
	/**
	 * A pinch shrinking the fitted subject dims the viewer this far, or stops
	 * dimming it.
	 */
	onFade: (opacity: number | undefined) => void
}

/** A frame's width and position in its stage. */
type Geometry = Point & { width: number }

// PhotoSwipe's zoom gesture tuning.
/** How much of a pinch past the largest size the subject follows. */
const upperFriction = 0.05
/** How much of a pinch below fit an enlarged subject follows. */
const lowerFriction = 0.15
/** How far past fit a pinch that started fitted can grow and still close. */
const closeAllowance = 1 / 15
/** The share of fit at which a pinch to close has dimmed the viewer fully. */
const fadeSpan = 1 / 1.2
/** A critically damped spring's frequency, per millisecond. */
const settleFrequency = 0.04

/** Below any size fingers can hold, and clear of dividing by zero. */
const smallestShare = 0.1
/**
 * The largest frame, in device pixels, kept on a compositor layer of its own.
 * Pinching a larger one back out would have every one of its tiles drawn.
 */
const compositedPixels = 32_000_000

/** Owns the single zoomed slide, its geometry, and caption interactivity. */
export class Zoom {
	get current(): Slide | undefined {
		return this.#slide
	}
	/** Whether a pinch holds the fitted subject smaller, on its way to closing. */
	get isShrinking(): boolean {
		return this.#fade !== undefined
	}
	/** Whether the pinch under way started fitted and has stayed about there. */
	#canClose = false
	#fade: number | undefined
	#fitted: Box = { height: 0, width: 0, x: 0, y: 0 }
	#isPinched = false
	/** The width the frame is laid out at, which a held pinch scales. */
	#layoutWidth = 0
	#maximumWidth = 0
	readonly #options: ZoomOptions
	#pan: Pan | undefined
	#pinchPoint: Point | undefined
	#settling: undefined | { finish: () => void; frame: number }
	#slide: Slide | undefined
	/** The width the frame is drawn at. */
	#width = 0

	constructor(options: ZoomOptions) {
		this.#options = options
	}

	/**
	 * Where in the subject a held point is, so that it stays there when fingers
	 * change. Free placement follows the point as drawn; a single finger's
	 * resists past a pan limit, and continues from the position that draws here.
	 */
	anchor(slide: Slide, point: Point, isFree: boolean): Point {
		const box = slide.layer.getBoundingClientRect()
		const pan = this.#slide === slide ? this.#pan : undefined
		// Fingers have just landed or changed: the one time a gesture reads the
		// stage, which its moves then place the subject in without looking again
		pan?.measure()
		const origin = isFree || this.isShrinking ? undefined : pan?.origin()
		const stage = slide.stage.getBoundingClientRect()
		const frame = slide.frame.getBoundingClientRect()
		return {
			x: (point.x - box.x - (origin === undefined ? 0 : stage.x + origin.x - frame.x)) / box.width,
			y: (point.y - box.y - (origin === undefined ? 0 : stage.y + origin.y - frame.y)) / box.height,
		}
	}

	/**
	 * End a pinch as PhotoSwipe does. Released smaller than fit, having started
	 * fitted, it closes the viewer from where it is held. Otherwise a size past
	 * either limit springs back to it about the pinched point, and the layout,
	 * with the image's resolution, catches up with the size held. Cut short by
	 * something else, the subject is left as held for that to take over.
	 */
	finishPinch(ending: PinchEnding): PinchOutcome {
		const slide = this.#slide
		const canClose = this.#canClose
		this.#canClose = false
		if (slide === undefined || this.#pan === undefined) {
			return 'kept'
		}

		if (!this.#isPinched) {
			// A pan of a preset size leaves nothing to settle
			this.#size(slide, this.#layoutWidth)
			return 'kept'
		}

		const fit = this.#fitted.width
		const width = this.#width
		if (ending === 'release' && canClose && width < fit) {
			// Laid out as held, where the way home starts. Closing takes over the
			// viewer's dimming from here.
			this.#size(slide, width)
			this.#fade = undefined
			return 'close'
		}

		this.#setFade(undefined)
		if (ending === 'interrupt') {
			this.#size(slide, width)
			return 'kept'
		}

		const target = Math.min(Math.max(width, fit), this.#maximumWidth)
		const isFit = target <= fit + 1
		if (target === width && !isFit) {
			this.#size(slide, width)
			prepareSlideImage(slide)
			return 'kept'
		}

		const from = { ...this.#pan.at, width }
		if (isFit) {
			this.#settle(slide, from, { x: this.#fitted.x, y: this.#fitted.y, width: fit }, true)
			return 'settling'
		}

		const stage = slide.stage.getBoundingClientRect()
		const point = this.#pinchPoint ?? {
			x: stage.x + stage.width / 2,
			y: stage.y + stage.height / 2,
		}
		const held = { x: point.x - stage.x, y: point.y - stage.y }
		const scale = target / width
		this.#pan.setLimits(this.#fitted, this.#sizeOf(target))
		const to = this.#pan.bound({
			x: held.x - (held.x - from.x) * scale,
			y: held.y - (held.y - from.y) * scale,
		})
		this.#settle(slide, from, { width: target, ...to }, false)
		return 'settling'
	}

	/** Continue a released touch pan, or settle an overshoot without momentum. */
	fling(velocity?: Point) {
		this.#pan?.release(velocity)
	}

	/** Leave a departing slide's geometry intact for its closing transition. */
	forget(slide: Slide) {
		if (this.#slide !== slide) {
			return
		}

		this.#untrack()
		this.#options.onChange()
	}

	/** Undo scale resistance when fingers change or catch a return transition. */
	gestureWidth(slide: Slide): number {
		const { width } = slide.layer.getBoundingClientRect()
		const minimum =
			this.#slide === slide ? this.#fitted.width : slide.frame.getBoundingClientRect().width
		if (width < minimum) {
			// A pinch to close follows the fingers as they are
			return this.isShrinking ? width : Math.max(0, minimum + (width - minimum) / lowerFriction)
		}

		const maximum = this.#slide === slide ? this.#maximumWidth : minimum * 8
		if (width > maximum) {
			const distance = width - maximum
			return maximum + distance / (upperFriction * Math.max(0.01, 1 - distance / (maximum * 0.1)))
		}

		return width
	}

	/**
	 * Pan by a discrete wheel or keyboard step, within the shared limits: the
	 * view moves by `point`, as a scroll would, so the subject moves against it.
	 */
	panBy(point: Point) {
		this.stopPan()
		const at = this.#pan?.at
		if (at !== undefined) {
			this.#pan?.move({ x: at.x - point.x, y: at.y - point.y })
		}
	}

	/**
	 * Resize about the point under the fingers, independently of the preset, as
	 * PhotoSwipe does. Two fingers place the subject freely, and a single one
	 * resists past the pan limits. A size past either limit resists too, except
	 * that a subject pinched smaller from fitted follows the fingers as they are,
	 * dimming the viewer, to close on release.
	 */
	pinch(slide: Slide, width: number, anchor: Point, point: Point, isFree: boolean) {
		const isStarting = this.#slide !== slide
		if (isStarting) {
			this.reset()
			this.#measureFit(slide)
			// Moving two fingers together on fitted media must not hide its caption.
			if (Math.abs(width - this.#fitted.width) <= 1) {
				return
			}

			this.#track(slide, this.#fitted.width)
			this.#enter(slide)
			this.#size(slide, this.#fitted.width)
			this.#pan?.measure()
			this.#canClose = true
		}

		this.#dropSettle()
		const fit = this.#fitted.width
		if (width > fit * (1 + closeAllowance)) {
			this.#canClose = false
		}

		let fade: number | undefined
		if (width < fit && this.#canClose) {
			width = Math.max(width, fit * smallestShare)
			fade = Math.max(0, 1 - (fit - width) / (fit * fadeSpan))
		} else if (width < fit) {
			width = fit + (width - fit) * lowerFriction
		} else if (width > this.#maximumWidth) {
			const distance = (width - this.#maximumWidth) * upperFriction
			width = this.#maximumWidth + distance / (1 + distance / (this.#maximumWidth * 0.1))
		}

		this.#pinchPoint = { ...point }
		this.#isPinched ||= isStarting || Math.abs(width - this.#width) > 0.5
		this.#setFade(fade)
		this.#enter(slide)
		this.#size(slide, width, true)
		setLayerStyle(slide.layer, identity, false)
		this.#place(width, anchor, point, isFree || fade !== undefined ? 'free' : 'elastic')
		if (isStarting) {
			this.#options.onChange()
		}
	}

	/** Restore fitting once a navigated-away slide is out of view. */
	reset() {
		const slide = this.#slide
		if (slide === undefined) {
			return
		}

		this.#untrack()
		this.#clear(slide)
		slide.caption?.removeAttribute('inert')
		setLayerStyle(slide.layer, identity, false)
		prepareSlideImage(slide)
		this.#options.onChange()
	}

	/** Preserve the viewed point across viewport changes and rotation. */
	resize() {
		this.stopPan()
		const slide = this.#slide
		const center = this.#pan?.center
		if (slide === undefined || center === undefined) {
			return
		}

		const { translate } = slide.frame.style
		slide.frame.style.translate = 'none'
		this.#leave(slide)
		this.#measureFit(slide)
		this.#enter(slide)
		slide.frame.style.translate = translate
		if (this.#isPinched && this.#layoutWidth <= this.#fitted.width) {
			this.reset()
			return
		}

		if (!this.#isPinched && slide.item.dataset.level === 'fill' && slide.lift !== undefined) {
			this.#size(
				slide,
				Math.max(slide.element.clientWidth, slide.element.clientHeight * slide.lift.ratio),
			)
		} else if (this.#layoutWidth > this.#maximumWidth) {
			// An interrupted pinch was left as large as it was held
			this.#size(slide, this.#maximumWidth)
		}

		setLayerStyle(slide.layer, identity, false)
		this.#pan?.measure()
		const box = slide.stage.getBoundingClientRect()
		this.#place(this.#layoutWidth, center, {
			x: box.x + box.width / 2,
			y: box.y + box.height / 2,
		})
	}

	/** Animate between the fitted layout and an enlarged subject. */
	set(slide: Slide, width: number | undefined, point?: Point) {
		this.stopPan()
		if (this.#slide !== undefined && this.#slide !== slide) {
			this.reset()
		}

		const from = slide.layer.getBoundingClientRect()
		this.#isPinched = false
		if (slide.lift !== undefined) {
			refreshImagePreview(slide.lift.subject)
		}

		if (width === undefined) {
			this.#untrack()
			this.#clear(slide)
		} else {
			if (this.#slide !== slide) {
				this.#measureFit(slide)
				this.#track(slide, width)
			}

			this.#enter(slide)
			this.#size(slide, width)
			this.#pan?.measure()
			point ??= { x: from.x + from.width / 2, y: from.y + from.height / 2 }
			this.#place(
				width,
				{ x: (point.x - from.x) / from.width, y: (point.y - from.y) / from.height },
				point,
			)
		}

		if (slide.caption !== undefined) {
			slide.caption.inert = width !== undefined
		}

		prepareSlideImage(slide)
		setLayerStyle(
			slide.layer,
			layerStyle(slide.frame.getBoundingClientRect(), from, { fit: 'contain', radius: 0 }),
			false,
		)
		slide.layer.getAnimations()
		setLayerStyle(slide.layer, identity)
		this.#options.onChange()
	}

	/**
	 * Catch momentum at its current position without resetting the zoom. A pinch
	 * still settling lands at once, unless `hold` leaves it where it is, for the
	 * fingers that caught it.
	 */
	stopPan(hold = false): boolean {
		const settling = this.#settling
		if (settling !== undefined) {
			if (hold) {
				this.#dropSettle()
			} else {
				settling.finish()
			}
		}

		return (this.#pan?.stop() ?? false) || settling !== undefined
	}

	/** Put the frame, and the caption, back into the slide's fitted layout. */
	#clear(slide: Slide) {
		this.#leave(slide)
		for (const property of ['--amk-lightbox-zoomed-width', 'translate', 'scale', 'will-change']) {
			slide.frame.style.removeProperty(property)
		}
	}

	/** Leave a pinch that was settling where it is drawn. */
	#dropSettle() {
		if (this.#settling === undefined) {
			return
		}

		cancelAnimationFrame(this.#settling.frame)
		this.#settling = undefined
		delete this.#slide?.stage.dataset.panning
	}

	/**
	 * Take the stage out of the slide's flow, holding the caption where it is:
	 * one beside the subject would otherwise center itself in the slide before it
	 * fades out.
	 */
	#enter(slide: Slide) {
		if (Object.hasOwn(slide.element.dataset, 'zoomed')) {
			return
		}

		const { caption } = slide
		const before = caption?.getBoundingClientRect()
		slide.element.dataset.zoomed = ''
		if (caption === undefined || before === undefined) {
			return
		}

		const after = caption.getBoundingClientRect()
		const x = before.x - after.x
		const y = before.y - after.y
		if (Math.abs(x) >= 0.5 || Math.abs(y) >= 0.5) {
			caption.style.translate = `${x}px ${y}px`
		}
	}

	readonly #handleWheel = (event: WheelEvent) => {
		const slide = this.#slide
		if (
			slide === undefined ||
			event.ctrlKey ||
			isWithin(event, `${controlSelector},media-controls,[data-popup]`, slide.stage)
		) {
			return
		}

		event.preventDefault()
		const unit =
			event.deltaMode === WheelEvent.DOM_DELTA_LINE
				? 16
				: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
					? slide.stage.clientHeight
					: 1
		this.panBy({
			x: (event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX) * unit,
			y: (event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY) * unit,
		})
	}

	/** Return the stage, and the caption, to the slide's flow. */
	#leave(slide: Slide) {
		delete slide.element.dataset.zoomed
		slide.caption?.style.removeProperty('translate')
	}

	#measureFit(slide: Slide) {
		const frame = slide.frame.getBoundingClientRect()
		const box = slide.element.getBoundingClientRect()
		this.#fitted = {
			height: frame.height,
			width: frame.width,
			x: frame.x - box.x,
			y: frame.y - box.y,
		}
	}

	/**
	 * Draw the subject `width` wide, with the point `anchor` of it under `point`
	 * in the viewport: in the stage as last measured, reading nothing.
	 */
	#place(width: number, anchor: Point, point: Point, resistance: Resistance = 'clamp') {
		const pan = this.#pan
		if (pan === undefined) {
			return
		}

		const { stage } = pan
		const size = this.#sizeOf(width)
		pan.setLimits(this.#fitted, size)
		pan.move(
			{
				x: point.x - stage.x - anchor.x * size.x,
				y: point.y - stage.y - anchor.y * size.y,
			},
			resistance,
		)
	}

	/** Dim the viewer with a pinch to close, or stop dimming it. */
	#setFade(fade: number | undefined) {
		const wasShrinking = this.isShrinking
		if (fade === undefined && !wasShrinking) {
			return
		}

		this.#fade = fade
		this.#options.onFade(fade)
		if (wasShrinking !== this.isShrinking) {
			this.#options.onChange()
		}
	}

	/**
	 * Spring the frame to its place within the limits, with PhotoSwipe's tuning,
	 * then lay it out there, or return it to the fitted layout.
	 */
	#settle(slide: Slide, from: Geometry, to: Geometry, isFit: boolean) {
		const finish = () => {
			this.#dropSettle()
			if (isFit) {
				this.reset()
				return
			}

			this.#size(slide, to.width)
			this.#pan?.move(to)
			prepareSlideImage(slide)
		}

		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			finish()
			return
		}

		const start = performance.now()
		const step = (time: number) => {
			const elapsed = Math.max(0, time - start) * settleFrequency
			const remaining = (1 + elapsed) * Math.exp(-elapsed)
			if (remaining < 0.001) {
				finish()
				return
			}

			this.#size(slide, to.width + (from.width - to.width) * remaining, true)
			this.#pan?.move(
				{ x: to.x + (from.x - to.x) * remaining, y: to.y + (from.y - to.y) * remaining },
				'free',
			)
			this.#settling = { finish, frame: requestAnimationFrame(step) }
		}

		slide.stage.dataset.panning = ''
		this.#settling = { finish, frame: requestAnimationFrame(step) }
	}

	/**
	 * Lay the frame out `width` wide. While fingers hold it, or it settles, its
	 * last layout is scaled to that width instead, as PhotoSwipe does: the
	 * compositor resizes the pixels already drawn, and the layout, with the
	 * image's resolution, catches up once, on release.
	 */
	#size(slide: Slide, width: number, isHeld = false) {
		const { style } = slide.frame
		this.#width = width
		if (isHeld) {
			style.scale = String(width / this.#layoutWidth)
			return
		}

		this.#layoutWidth = width
		style.removeProperty('scale')
		style.setProperty('--amk-lightbox-zoomed-width', `${width}px`)
		const size = this.#sizeOf(width)
		style.willChange =
			size.x * size.y * devicePixelRatio ** 2 <= compositedPixels ? 'transform' : ''
	}

	/** The frame's size at a width, with x for its width and y for its height. */
	#sizeOf(width: number): Point {
		return { x: width, y: (width * this.#fitted.height) / this.#fitted.width }
	}

	#track(slide: Slide, width: number) {
		this.#slide = slide
		this.#maximumWidth = Math.max(this.#fitted.width * 8, width)
		this.#pan = new Pan(slide)
		slide.stage.focus({ preventScroll: true })
		slide.stage.addEventListener('wheel', this.#handleWheel, { passive: false })
		if (slide.caption !== undefined) {
			slide.caption.inert = true
		}
	}

	#untrack() {
		this.#dropSettle()
		this.#pan?.stop()
		this.#slide?.stage.removeEventListener('wheel', this.#handleWheel)
		this.#slide = undefined
		this.#pan = undefined
		this.#isPinched = false
		this.#canClose = false
		this.#fade = undefined
		this.#fitted.width = 0
		this.#maximumWidth = 0
		this.#layoutWidth = 0
		this.#width = 0
		this.#pinchPoint = undefined
	}
}
