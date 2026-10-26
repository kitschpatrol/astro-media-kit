import type { Box } from './geometry'
import type { LayerStyle, Measurement, Point } from './types'
import { mapFrameToBox } from './geometry'

/** How much smaller than its frame a link's media is at the link. */
const linkScale = 0.5

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
 * written as identity, so they don't start transitions that do nothing.
 */
export function layerStyle(
	frame: Box,
	target: Box,
	{ fit, position, radius }: Pick<Measurement, 'fit' | 'radius'> & { position?: Point },
): LayerStyle {
	const transform = mapFrameToBox(frame, target, fit, position)
	const isTranslated = Math.abs(transform.x) >= 0.5 || Math.abs(transform.y) >= 0.5
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
		translate: isTranslated ? `${transform.x}px ${transform.y}px` : identity.translate,
	}
}

/**
 * The layer style that centers a frame at `frame` on a link at `target`, at
 * half size and transparent: where the link's media grows out from, and shrinks
 * back into.
 */
export function linkStyle(frame: Box, target: Box): LayerStyle {
	const x = target.x + target.width / 2 - frame.x - (frame.width * linkScale) / 2
	const y = target.y + target.height / 2 - frame.y - (frame.height * linkScale) / 2
	return {
		clipPath: identity.clipPath,
		opacity: '0',
		scale: String(linkScale),
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
