import type { Point, Slide } from './types'
import { identity, layerStyle, setLayerStyle } from './animation'
import { refreshImagePreview } from './image-preview'

/** Owns the single zoomed slide, its geometry, and caption interactivity. */
export class Zoom {
	get current(): Slide | undefined {
		return this.#slide
	}
	readonly #onChange: () => void
	#slide: Slide | undefined
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

		this.#slide = undefined
		this.#onChange()
	}
	/**
	 * Put a zoomed slide straight back to fitting the stage, without animating:
	 * once it has been navigated away from and is out of view, or when a resize
	 * leaves its zoomed size out of date.
	 */
	reset() {
		const slide = this.#slide
		if (slide === undefined) {
			return
		}

		delete slide.element.dataset.zoomed
		slide.element.querySelector<HTMLElement>('.amk-lightbox-caption')?.removeAttribute('inert')
		slide.frame.style.removeProperty('--amk-lightbox-zoom-width')
		setLayerStyle(slide.layer, identity, false)
		this.#slide = undefined
		this.#onChange()
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
			delete slide.element.dataset.zoomed
			slide.frame.style.removeProperty('--amk-lightbox-zoom-width')
			this.#slide = undefined
		} else {
			slide.element.dataset.zoomed = ''
			slide.frame.style.setProperty('--amk-lightbox-zoom-width', `${width}px`)
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
		}

		const caption = slide.element.querySelector<HTMLElement>('.amk-lightbox-caption')
		if (caption !== null) {
			caption.inert = width !== undefined
		}

		setLayerStyle(
			slide.layer,
			layerStyle(slide.frame.getBoundingClientRect(), from, { fit: 'contain', radius: 0 }),
			false,
		)
		slide.layer.getAnimations()
		setLayerStyle(slide.layer, identity)
		this.#onChange()
	}
}
