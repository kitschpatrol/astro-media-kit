/** A box in viewport coordinates, as returned by `getBoundingClientRect()`. */
export type Box = {
	height: number
	width: number
	x: number
	y: number
}

/**
 * How an element's content fills its box. A simplification of CSS `object-fit`:
 * `none` and `scale-down` behave like `contain` here.
 */
export type Fit = 'contain' | 'cover' | 'fill'

/**
 * Translate, scale, and clip-path inset for a layer that fills the overlay
 * frame (laid out at its final size and position), so that it looks exactly
 * like the element as rendered in the page. Insets are in the layer's local,
 * pre-transform pixels, because `clip-path` applies before `translate` and
 * `scale`. Assumes `transform-origin: 0 0` on the layer.
 */
type FrameTransform = {
	insetBottom: number
	insetRight: number
	insetX: number
	insetY: number
	scaleX: number
	scaleY: number
	x: number
	y: number
}

/** The transform that leaves the layer exactly over the frame. */
const identityTransform: FrameTransform = {
	insetBottom: 0,
	insetRight: 0,
	insetX: 0,
	insetY: 0,
	scaleX: 1,
	scaleY: 1,
	x: 0,
	y: 0,
}

const center = { x: 0.5, y: 0.5 }

/**
 * A computed pixel length as a number, or NaN for anything else, such as
 * `auto`.
 */
export function lengthOf(value: string): number {
	return value.endsWith('px') ? Number(value.slice(0, -2)) : NaN
}

/**
 * Map a frame onto the visible content of an element in the page.
 *
 * The frame always has the content's natural aspect ratio. In the page, the
 * same content may be letterboxed (`contain`), cropped (`cover`), or stretched
 * (`fill`) inside a box of a different ratio. `contain` and `cover` keep the
 * scale uniform so the content never distorts mid-animation; `cover` clips the
 * frame down to the page box so a cropped thumbnail reveals the full image as
 * the clip opens.
 *
 * @param frame - The frame's box in the overlay.
 * @param target - The element's box in the page.
 * @param fit - How the element's content fills its page box.
 *
 * @returns The identity transform when the frame has no area to scale from.
 */
export function mapFrameToBox(
	frame: Box,
	target: Box,
	fit: Fit,
	position = center,
): FrameTransform {
	if (frame.width <= 0 || frame.height <= 0) {
		return identityTransform
	}

	const ratioX = target.width / frame.width
	const ratioY = target.height / frame.height

	let scaleX: number
	let scaleY: number
	if (fit === 'fill') {
		scaleX = ratioX
		scaleY = ratioY
	} else {
		const scale = fit === 'cover' ? Math.max(ratioX, ratioY) : Math.min(ratioX, ratioY)
		scaleX = scale
		scaleY = scale
	}

	const contentWidth = frame.width * scaleX
	const contentHeight = frame.height * scaleY
	const cropX = Math.max(0, frame.width - target.width / scaleX)
	const cropY = Math.max(0, frame.height - target.height / scaleY)
	const isClipped = fit === 'cover' && scaleX > 0

	return {
		insetBottom: isClipped ? cropY * (1 - position.y) : 0,
		insetRight: isClipped ? cropX * (1 - position.x) : 0,
		insetX: isClipped ? cropX * position.x : 0,
		insetY: isClipped ? cropY * position.y : 0,
		scaleX,
		scaleY,
		x: target.x + (target.width - contentWidth) * position.x - frame.x,
		y: target.y + (target.height - contentHeight) * position.y - frame.y,
	}
}
