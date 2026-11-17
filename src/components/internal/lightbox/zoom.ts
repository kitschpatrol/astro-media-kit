import type { Point, Slide } from './types'
import { identity, layerStyle, setLayerStyle } from './animation'
import { refreshImagePreview } from './image-preview'
import { prepareSlideImage } from './prepare'

/** Owns the single zoomed slide, its geometry, and caption interactivity. */
export class Zoom {
	get current(): Slide | undefined {
		return this.#slide
	}
	readonly #onChange: () => void
	#slide: Slide | undefined
	#view: undefined | { center: Point; height: number; width: number }
	constructor(onChange: () => void) {
		this.#onChange = onChange
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

		if (slide.item.dataset.level === 'fill' && slide.lift !== undefined) {
			const width = Math.max(
				slide.element.clientWidth,
				slide.element.clientHeight * slide.lift.ratio,
			)
			slide.frame.style.setProperty('--amk-lightbox-zoomed-width', `${width}px`)
		}

		// Layout can change during the zoom transition too. Measure the frame,
		// whose coordinates are independent of the animated layer inside it.
		setLayerStyle(slide.layer, identity, false)
		const frame = slide.frame.getBoundingClientRect()
		const { stage } = slide
		const box = stage.getBoundingClientRect()
		stage.scrollTo({
			behavior: 'instant',
			left:
				stage.scrollLeft +
				frame.x +
				view.center.x * frame.width -
				box.x -
				stage.clientLeft -
				stage.clientWidth / 2,
			top:
				stage.scrollTop +
				frame.y +
				view.center.y * frame.height -
				box.y -
				stage.clientTop -
				stage.clientHeight / 2,
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
		if (slide.lift !== undefined) {
			refreshImagePreview(slide.lift.subject)
		}

		const { stage } = slide
		if (width === undefined) {
			this.#untrack()
			delete slide.element.dataset.zoomed
			slide.frame.style.removeProperty('--amk-lightbox-zoomed-width')
		} else {
			slide.element.dataset.zoomed = ''
			slide.frame.style.setProperty('--amk-lightbox-zoomed-width', `${width}px`)
			this.#slide = slide
			// Keyboard scrolling goes to the focused scroll container
			stage.focus({ preventScroll: true })
			if (point !== undefined) {
				// Measured with the stage at its current scroll offset, so this is an
				// absolute target
				const to = slide.frame.getBoundingClientRect()
				stage.scrollTo({
					behavior: 'instant',
					left: stage.scrollLeft + to.x + ((point.x - from.x) / from.width) * to.width - point.x,
					top: stage.scrollTop + to.y + ((point.y - from.y) / from.height) * to.height - point.y,
				})
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
	}
}
