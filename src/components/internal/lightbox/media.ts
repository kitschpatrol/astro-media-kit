import type { Slide } from './types'
import { rendered } from './dom'

/** How much larger than fitting a zoom must make the subject to be worth it. */
const minimumZoom = 1.1

/**
 * The width at which one pixel of the subject's media takes one CSS pixel. The
 * components render it as `data-native-width`, from the largest generated image
 * candidate or the video's source dimensions. Other media report their own
 * size; anything else has no pixels of its own.
 */
function nativeWidth(item: HTMLElement, subject: Element): number | undefined {
	const width = Number(item.dataset.nativeWidth)
	if (width > 0) {
		return width
	}

	const media = rendered(subject)
	if (media instanceof HTMLVideoElement) {
		return media.videoWidth > 0 ? media.videoWidth : undefined
	}

	if (media instanceof HTMLImageElement) {
		return media.naturalWidth > 0 ? media.naturalWidth : undefined
	}

	return undefined
}

/** Whether a click on an item's opened subject zooms it, rather than closing. */
export function hasZoomLevel(item: HTMLElement): boolean {
	const { level } = item.dataset
	return level === 'fill' || level === 'native'
}

/**
 * The width a slide's subject is laid out at when zoomed to its item's `level`:
 * `fill` covers the slide, and `native` shows the media pixel for pixel.
 * Undefined when that would hardly enlarge it, so a click closes instead.
 */
export function zoomWidth(slide: Slide): number | undefined {
	const { item, lift } = slide
	if (lift === undefined || !hasZoomLevel(item)) {
		return undefined
	}

	const width =
		item.dataset.level === 'fill'
			? Math.max(slide.element.clientWidth, slide.element.clientHeight * lift.ratio)
			: nativeWidth(item, lift.subject)
	return width !== undefined && width >= slide.frame.offsetWidth * minimumZoom ? width : undefined
}
