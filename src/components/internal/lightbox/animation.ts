import type { Box } from './geometry'
import type { LayerStyle, Lift, Measurement, Point } from './types'
import { mapFrameToBox } from './geometry'
import { isImageOrVideo } from './media'

/** The untransformed layer. */
export const identity: LayerStyle = {
	clipPath: 'inset(0)',
	opacity: '1',
	scale: 'none',
	translate: 'none',
}

/**
 * The layer style that makes a frame at `frame` look like the subject as
 * rendered at `target` in the page. Values within half a pixel of identity are
 * written as identity, so they don't start transitions that do nothing. The
 * layer turns about its center, so `translate` is how far the subject's middle
 * travels and `scale` how much it grows, and each can keep a pace of its own.
 */
export function layerStyle(
	frame: Box,
	target: Box,
	{ fit, position, radius }: Pick<Measurement, 'fit' | 'radius'> & { position?: Point },
): LayerStyle {
	const transform = mapFrameToBox(frame, target, fit, position)
	// From the frame's top-left corner, where the mapping scales from
	const x = transform.x + ((transform.scaleX - 1) * frame.width) / 2
	const y = transform.y + ((transform.scaleY - 1) * frame.height) / 2
	const isTranslated = Math.abs(x) >= 0.5 || Math.abs(y) >= 0.5
	const isScaled = Math.abs(transform.scaleX - 1) >= 1e-4 || Math.abs(transform.scaleY - 1) >= 1e-4
	const scaledRadius = transform.scaleX > 0 ? radius / transform.scaleX : 0
	const isClipped =
		transform.insetX >= 0.5 ||
		transform.insetY >= 0.5 ||
		transform.insetRight >= 0.5 ||
		transform.insetBottom >= 0.5 ||
		scaledRadius >= 0.5
	return {
		clipPath: isClipped
			? `inset(${transform.insetY}px ${transform.insetRight}px ${transform.insetBottom}px ${transform.insetX}px round ${scaledRadius}px)`
			: identity.clipPath,
		opacity: '1',
		scale: isScaled ? `${transform.scaleX} ${transform.scaleY}` : identity.scale,
		translate: isTranslated ? `${x}px ${y}px` : identity.translate,
	}
}

/** The page end of an opening or closing transition, including its fade. */
export function pageStyle(frame: Box, target: Box, lift: Lift): LayerStyle {
	if (lift.kind === 'link') {
		return linkStyle(frame, target)
	}

	const style = layerStyle(frame, target, lift)
	if (
		lift.kind === 'move' &&
		lift.subject instanceof HTMLElement &&
		!isImageOrVideo(lift.subject)
	) {
		style.opacity = '0'
	}

	return style
}

/**
 * The layer style that centers a frame at `frame` on a link at `target`, as
 * tall as the link's text and transparent: where the link's media grows out
 * from, and shrinks back into.
 */
function linkStyle(frame: Box, target: Box): LayerStyle {
	const scale = frame.height > 0 ? Math.min(1, target.height / frame.height) : 1
	const x = target.x + target.width / 2 - frame.x - frame.width / 2
	const y = target.y + target.height / 2 - frame.y - frame.height / 2
	return {
		clipPath: identity.clipPath,
		opacity: '0',
		scale: String(scale),
		translate: `${x}px ${y}px`,
	}
}

/** Apply the layer transform, optionally bypassing transitions. */
export function setLayerStyle(layer: HTMLElement, style: LayerStyle, isAnimated = true) {
	layer.style.transition = isAnimated ? '' : 'none'
	layer.style.translate = style.translate
	layer.style.scale = style.scale
	layer.style.clipPath = style.clipPath
	layer.style.opacity = style.opacity
}

/**
 * Wait for the transitions on `element` to finish, or to be interrupted,
 * including any that replace them meanwhile, as a resize points them
 * elsewhere.
 */
export async function settle(element: Element) {
	for (;;) {
		const running = element
			.getAnimations()
			.filter((animation) => animation.playState !== 'finished')
		if (running.length === 0) {
			return
		}

		await Promise.allSettled(running.map(async (animation) => animation.finished))
	}
}
