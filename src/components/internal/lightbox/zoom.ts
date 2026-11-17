import type { Point, Slide } from './types'
import { identity, layerStyle, setLayerStyle } from './animation'
import { refreshImagePreview } from './image-preview'
import { prepareSlideImage } from './prepare'

/** Owns the single zoomed slide, its geometry, and caption interactivity. */
export class Zoom {
	get current(): Slide | undefined {
		return this.#slide
	}
	#fittedWidth = 0
	#isPinched = false
	readonly #onChange: () => void
	#slide: Slide | undefined
	#view: undefined | { center: Point; height: number; width: number }
	constructor(onChange: () => void) {
		this.#onChange = onChange
	}

	/** Restore the fitted layout, or load the final image size after a pinch. */
	finishPinch() {
		const slide = this.#slide
		if (slide === undefined || !this.#isPinched) {
			return
		}

		if (slide.frame.getBoundingClientRect().width <= this.#fittedWidth + 1) {
			this.set(slide, undefined)
		} else {
			prepareSlideImage(slide)
		}
	}
	/**
	 * Stop tracking a slide that is leaving as it is, zoomed or not, so its
	 * styles stay untouched while it finishes its way home.
	 */
	forget(slide: Slide) {
		if (this.#slide !== slide) {
			return
		}

		this.#untrack()
		this.#onChange()
	}

	/** Resize about an image point under the fingers, independently of the preset. */
	pinch(slide: Slide, width: number, anchor: Point, point: Point) {
		const isStarting = this.#slide !== slide
		if (isStarting) {
			this.reset()
			this.#fittedWidth = slide.frame.getBoundingClientRect().width
			// Two fingers moving together on a fitted image must not turn it into
			// a zoomed image, or move its caption out of the way.
			if (width <= this.#fittedWidth + 1) {
				return
			}

			this.#slide = slide
			slide.stage.focus({ preventScroll: true })
			slide.stage.addEventListener('scroll', this.#handleScroll, { passive: true })
			if (slide.caption !== undefined) {
				slide.caption.inert = true
			}
		}

		this.#isPinched = true
		const maximum = Math.max(this.#fittedWidth * 8, slide.frame.getBoundingClientRect().width)
		width = Math.min(Math.max(width, this.#fittedWidth), maximum)
		slide.element.dataset.zoomed = ''
		slide.frame.style.setProperty('--amk-lightbox-zoomed-width', `${width}px`)
		setLayerStyle(slide.layer, identity, false)
		this.#place(slide, anchor, point)
		this.#remember()
		if (isStarting) {
			this.#onChange()
		}
	}

	/**
	 * Put a zoomed slide straight back to fitting the stage, without animating:
	 * once it has been navigated away from and is out of view.
	 */
	reset() {
		const slide = this.#slide
		if (slide === undefined) {
			return
		}

		this.#untrack()
		delete slide.element.dataset.zoomed
		slide.element.querySelector<HTMLElement>('.amk-lightbox-caption')?.removeAttribute('inert')
		slide.frame.style.removeProperty('--amk-lightbox-zoomed-width')
		setLayerStyle(slide.layer, identity, false)
		prepareSlideImage(slide)
		this.#onChange()
	}

	/** Keep the viewed image point centered when the stage changes size. */
	resize() {
		const slide = this.#slide
		const view = this.#view
		if (slide === undefined || view === undefined) {
			return
		}

		// Measure the fitted layout without painting it. Restoring the remembered
		// center below also restores offsets clamped by this temporary layout.
		delete slide.element.dataset.zoomed
		this.#fittedWidth = slide.frame.getBoundingClientRect().width
		slide.element.dataset.zoomed = ''
		if (this.#isPinched && slide.frame.getBoundingClientRect().width <= this.#fittedWidth) {
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

		// Layout can change during the zoom transition too. Measure the frame,
		// whose coordinates are independent of the animated layer inside it.
		setLayerStyle(slide.layer, identity, false)
		const { stage } = slide
		const box = stage.getBoundingClientRect()
		this.#place(slide, view.center, {
			x: box.x + stage.clientLeft + stage.clientWidth / 2,
			y: box.y + stage.clientTop + stage.clientHeight / 2,
		})
		// Native scrolling clamps the center at an edge. Remember that actual
		// position, so a later resize does not jump back to an unreachable point.
		this.#remember()
	}

	/**
	 * Lay a slide's subject out `width` pixels wide in a stage that scrolls, with
	 * `point` scrolled to stay under the pointer, or back to fitting the stage
	 * when `width` is undefined. Animates from wherever the subject is showing,
	 * even partway through another transition.
	 */
	set(slide: Slide, width: number | undefined, point?: Point) {
		if (this.#slide !== undefined && this.#slide !== slide) {
			this.reset()
		}

		const from = slide.layer.getBoundingClientRect()
		this.#isPinched = false
		if (slide.lift !== undefined) {
			refreshImagePreview(slide.lift.subject)
		}

		const { stage } = slide
		if (width === undefined) {
			this.#untrack()
			delete slide.element.dataset.zoomed
			slide.frame.style.removeProperty('--amk-lightbox-zoomed-width')
		} else {
			if (this.#slide !== slide) {
				this.#fittedWidth = slide.frame.getBoundingClientRect().width
			}

			slide.element.dataset.zoomed = ''
			slide.frame.style.setProperty('--amk-lightbox-zoomed-width', `${width}px`)
			this.#slide = slide
			// Keyboard scrolling goes to the focused scroll container
			stage.focus({ preventScroll: true })
			if (point !== undefined) {
				this.#place(
					slide,
					{ x: (point.x - from.x) / from.width, y: (point.y - from.y) / from.height },
					point,
				)
			}

			this.#remember()
			stage.addEventListener('scroll', this.#handleScroll, { passive: true })
		}

		const caption = slide.element.querySelector<HTMLElement>('.amk-lightbox-caption')
		if (caption !== null) {
			caption.inert = width !== undefined
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

	readonly #handleScroll = () => {
		const stage = this.#slide?.stage
		// A resize can clamp native offsets before ResizeObserver runs. Retain
		// the old center until resize() has applied it to the new dimensions.
		if (stage?.clientWidth === this.#view?.width && stage?.clientHeight === this.#view?.height) {
			this.#remember()
		}
	}

	/**
	 * Place a normalized image point at a viewport point, within native scroll
	 * bounds.
	 */
	#place(slide: Slide, anchor: Point, point: Point) {
		const frame = slide.frame.getBoundingClientRect()
		slide.stage.scrollBy({
			behavior: 'instant',
			left: frame.x + anchor.x * frame.width - point.x,
			top: frame.y + anchor.y * frame.height - point.y,
		})
	}

	#remember() {
		const slide = this.#slide
		if (slide === undefined) {
			return
		}

		const { stage } = slide
		const box = stage.getBoundingClientRect()
		const frame = slide.frame.getBoundingClientRect()
		this.#view = {
			center: {
				x: (box.x + stage.clientLeft + stage.clientWidth / 2 - frame.x) / frame.width,
				y: (box.y + stage.clientTop + stage.clientHeight / 2 - frame.y) / frame.height,
			},
			height: stage.clientHeight,
			width: stage.clientWidth,
		}
	}

	#untrack() {
		this.#slide?.stage.removeEventListener('scroll', this.#handleScroll)
		this.#slide = undefined
		this.#view = undefined
		this.#isPinched = false
		this.#fittedWidth = 0
	}
}
