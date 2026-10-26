import type { Box } from './geometry'
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

/**
 * The natural aspect ratio of an element's content: an image's or a video's own
 * once it has one, else its width and height attributes, which a loading image
 * carries, or its `aspect-ratio` style, which a player's container carries, or
 * else that of `box`, where it is laid out. 1 without any of those.
 */
export function ratioOf(element: Element, box: Box): number {
	if (element instanceof HTMLImageElement && element.complete && element.naturalHeight > 0) {
		return element.naturalWidth / element.naturalHeight
	}

	if (element instanceof HTMLVideoElement && element.videoHeight > 0) {
		return element.videoWidth / element.videoHeight
	}

	const width = Number(element.getAttribute('width'))
	const height = Number(element.getAttribute('height'))
	if (width > 0 && height > 0) {
		return width / height
	}

	if (element instanceof HTMLElement) {
		const [ratioWidth, ratioHeight = 1] = element.style.aspectRatio
			.split('/')
			.map((part) => Number(part.trim()))
		if (ratioWidth !== undefined && ratioWidth > 0 && ratioHeight > 0) {
			return ratioWidth / ratioHeight
		}
	}

	return box.width > 0 && box.height > 0 ? box.width / box.height : 1
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
