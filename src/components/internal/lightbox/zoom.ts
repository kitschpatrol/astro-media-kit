import type { Box } from './geometry'
import type { Point, Slide } from './types'
import { identity, layerStyle, setLayerStyle } from './animation'
import { controlSelector, isWithin } from './dom'
import { refreshImagePreview } from './image-preview'
import { Pan } from './pan'
import { prepareSlideImage } from './prepare'

/** Owns the single zoomed slide, its geometry, and caption interactivity. */
export class Zoom {
	get current(): Slide | undefined {
		return this.#slide
	}
	/** Raw drag coordinates before resistance, for catching beyond an edge. */
	get dragOrigin(): Point {
		const origin = this.#pan?.origin()
		return origin === undefined ? { x: 0, y: 0 } : { x: -origin.x, y: -origin.y }
	}
	get position(): Point {
		return this.#pan?.position ?? { x: 0, y: 0 }
	}
	#fitted: Box = { height: 0, width: 0, x: 0, y: 0 }
	#isPinched = false
	#maximumWidth = 0
	readonly #onChange: () => void
	#pan: Pan | undefined
	#pinchPoint: Point | undefined
	#slide: Slide | undefined
	constructor(onChange: () => void) {
		this.#onChange = onChange
	}

	/** Keep a held point continuous when fingers change beyond a pan limit. */
	anchor(slide: Slide, point: Point): Point {
		const box = slide.layer.getBoundingClientRect()
		const pan = this.#slide === slide ? this.#pan : undefined
		const origin = pan?.origin()
		const stage = slide.stage.getBoundingClientRect()
		const frame = slide.frame.getBoundingClientRect()
		return {
			x: (point.x - box.x - (origin === undefined ? 0 : stage.x + origin.x - frame.x)) / box.width,
			y: (point.y - box.y - (origin === undefined ? 0 : stage.y + origin.y - frame.y)) / box.height,
		}
	}

	/** Restore the fitted layout, or load the final image size after a pinch. */
	finishPinch(): boolean {
		const slide = this.#slide
		if (slide === undefined || !this.#isPinched) {
			return false
		}

		const { width } = slide.frame.getBoundingClientRect()
		if (width <= this.#fitted.width + 1) {
			this.set(slide, undefined)
			return true
		}

		if (width > this.#maximumWidth) {
			this.set(slide, this.#maximumWidth, this.#pinchPoint)
			this.#isPinched = true
			return true
		}

		prepareSlideImage(slide)
		return false
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
		this.#onChange()
	}

	/** Undo scale resistance when fingers change or catch a return transition. */
	gestureWidth(slide: Slide): number {
		const { width } = slide.layer.getBoundingClientRect()
		const minimum =
			this.#slide === slide ? this.#fitted.width : slide.frame.getBoundingClientRect().width
		if (width < minimum) {
			return Math.max(0, minimum + (width - minimum) / 0.15)
		}

		const maximum = this.#slide === slide ? this.#maximumWidth : minimum * 8
		if (width > maximum) {
			const distance = width - maximum
			return maximum + distance / (0.05 * Math.max(0.01, 1 - distance / (maximum * 0.1)))
		}

		return width
	}

	/** Pan by a discrete wheel or keyboard step, within the shared limits. */
	panBy(point: Point) {
		this.stopPan()
		const from = this.position
		this.panTo({ x: from.x + point.x, y: from.y + point.y })
	}

	/** Pan to scroll-like coordinates, optionally resisting a held overshoot. */
	panTo(point: Point, elastic = false) {
		this.#pan?.move({ x: -point.x, y: -point.y }, elastic)
	}

	/** Resize about the point under the fingers, independently of the preset. */
	pinch(slide: Slide, width: number, anchor: Point, point: Point) {
		const isStarting = this.#slide !== slide
		if (isStarting) {
			this.reset()
			this.#measureFit(slide)
			// Moving two fingers together on fitted media must not hide its caption.
			if (Math.abs(width - this.#fitted.width) <= 1) {
				return
			}

			this.#track(slide, this.#fitted.width)
		}

		const currentWidth = slide.frame.getBoundingClientRect().width
		if (width < this.#fitted.width) {
			width = this.#fitted.width + (width - this.#fitted.width) * 0.15
		} else if (width > this.#maximumWidth) {
			const distance = width - this.#maximumWidth
			width =
				this.#maximumWidth +
				(distance * 0.05) / (1 + (distance * 0.05) / (this.#maximumWidth * 0.1))
		}

		this.#pinchPoint = { ...point }
		this.#isPinched ||= isStarting || Math.abs(width - currentWidth) > 0.5
		slide.element.dataset.zoomed = ''
		slide.frame.style.setProperty('--amk-lightbox-zoomed-width', `${width}px`)
		setLayerStyle(slide.layer, identity, false)
		this.#place(slide, anchor, point, true)
		if (isStarting) {
			this.#onChange()
		}
	}

	/** Restore fitting once a navigated-away slide is out of view. */
	reset() {
		const slide = this.#slide
		if (slide === undefined) {
			return
		}

		this.#untrack()
		delete slide.element.dataset.zoomed
		slide.caption?.removeAttribute('inert')
		slide.frame.style.removeProperty('--amk-lightbox-zoomed-width')
		slide.frame.style.removeProperty('translate')
		setLayerStyle(slide.layer, identity, false)
		prepareSlideImage(slide)
		this.#onChange()
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
		delete slide.element.dataset.zoomed
		this.#measureFit(slide)
		slide.element.dataset.zoomed = ''
		slide.frame.style.translate = translate
		if (this.#isPinched && slide.frame.getBoundingClientRect().width <= this.#fitted.width) {
			this.reset()
			return
		}

		if (!this.#isPinched && slide.item.dataset.level === 'fill' && slide.lift !== undefined) {
			const width = Math.max(
				slide.element.clientWidth,
				slide.element.clientHeight * slide.lift.ratio,
			)
			slide.frame.style.setProperty('--amk-lightbox-zoomed-width', `${width}px`)
		}

		setLayerStyle(slide.layer, identity, false)
		const box = slide.stage.getBoundingClientRect()
		this.#place(slide, center, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
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
			delete slide.element.dataset.zoomed
			slide.frame.style.removeProperty('--amk-lightbox-zoomed-width')
			slide.frame.style.removeProperty('translate')
		} else {
			if (this.#slide !== slide) {
				this.#measureFit(slide)
				this.#track(slide, width)
			}

			slide.element.dataset.zoomed = ''
			slide.frame.style.setProperty('--amk-lightbox-zoomed-width', `${width}px`)
			point ??= { x: from.x + from.width / 2, y: from.y + from.height / 2 }
			this.#place(
				slide,
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
		this.#onChange()
	}

	/** Catch momentum at its current position without resetting the zoom. */
	stopPan(): boolean {
		return this.#pan?.stop() ?? false
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

	#place(slide: Slide, anchor: Point, point: Point, elastic = false) {
		const frame = slide.frame.getBoundingClientRect()
		const stage = slide.stage.getBoundingClientRect()
		this.#pan?.measure(this.#fitted)
		this.#pan?.move(
			{
				x: point.x - stage.x - anchor.x * frame.width,
				y: point.y - stage.y - anchor.y * frame.height,
			},
			elastic,
		)
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
		this.stopPan()
		this.#slide?.stage.removeEventListener('wheel', this.#handleWheel)
		this.#slide = undefined
		this.#pan = undefined
		this.#isPinched = false
		this.#fitted.width = 0
		this.#maximumWidth = 0
		this.#pinchPoint = undefined
	}
}
