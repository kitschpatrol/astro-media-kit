import type { Box } from './geometry'
import type { VideoPreviewFrame } from './video-placeholder'
import { previewContext } from './canvas-context'
import { clonePlaceholder } from './clone-placeholder'
import { rendered } from './dom'
import { lengthOf } from './geometry'
import { mirrorVideo, videoPreviewSize } from './video-placeholder'

/** A decorative copy, and the subject's box within the item's padding box. */
export type Placeholder = { box: Box; element: HTMLElement }

const disposers = new WeakMap<HTMLElement, () => void>()

/** Leave a decorative copy while the original subject is in the viewer. */
export function createPlaceholder(item: HTMLElement, subject: Element): Placeholder | undefined {
	if (item.dataset.placeholder === 'none') {
		return undefined
	}

	const visible = rendered(subject)
	const style = getComputedStyle(visible)
	const box = visible.getBoundingClientRect()
	const home = item.getBoundingClientRect()
	const isPlayer = visible.matches('media-container')
	// The player's media sits letterboxed in its container; other content keeps its own fit
	const objectFit = isPlayer ? 'contain' : style.objectFit
	const frame = { height: box.height, objectFit, width: box.width }
	let placeholder: HTMLElement | undefined
	if (isPlayer) {
		placeholder = playerPlaceholder(visible, frame)
	} else if (
		visible instanceof HTMLVideoElement &&
		typeof visible.requestVideoFrameCallback === 'function'
	) {
		const canvas = document.createElement('canvas')
		disposers.set(canvas, mirrorVideo(visible, canvas, frame))
		placeholder = canvas
	} else if (visible instanceof HTMLVideoElement || visible instanceof HTMLCanvasElement) {
		placeholder = snapshot(visible, frame)
	} else {
		const controller = new AbortController()
		placeholder = clonePlaceholder(subject, controller.signal)
		if (placeholder !== undefined) {
			disposers.set(placeholder, () => {
				controller.abort()
			})
		}
	}

	if (placeholder === undefined) {
		return undefined
	}

	placeholder.dataset.preview = ''
	placeholder.ariaHidden = 'true'
	placeholder.inert = true
	// Layout sizes, unaffected by transforms such as a hover zoom
	const scaleX = home.width / Math.max(item.offsetWidth, 1)
	const scaleY = home.height / Math.max(item.offsetHeight, 1)
	Object.assign(placeholder.style, {
		borderRadius: style.borderRadius,
		objectFit,
		objectPosition: style.objectPosition,
	})
	if (isPlayer) {
		placeholder.style.backgroundColor = style.backgroundColor
	}

	if (subject instanceof HTMLPictureElement) {
		const image = placeholder.querySelector('img')
		if (image !== null) {
			Object.assign(image.style, {
				boxSizing: 'border-box',
				height: '100%',
				margin: '0',
				objectFit: style.objectFit,
				objectPosition: style.objectPosition,
				width: '100%',
			})
		}
	}

	item.append(placeholder)
	return {
		box: {
			height: box.height / (scaleY > 0 ? scaleY : 1),
			width: box.width / (scaleX > 0 ? scaleX : 1),
			x: (box.x - home.x) / (scaleX > 0 ? scaleX : 1) - item.clientLeft,
			y: (box.y - home.y) / (scaleY > 0 ? scaleY : 1) - item.clientTop,
		},
		element: placeholder,
	}
}

/**
 * Lay a placeholder over the subject's box in the item's padding box: as
 * fractions of the space held when that follows a resize, so the copy follows
 * too, or else in pixels. `home` is the item's border box when measured.
 */
export function placePlaceholder(
	item: HTMLElement,
	{ box, element }: Placeholder,
	home: Box,
	isFluid: boolean,
) {
	if (!isFluid) {
		Object.assign(element.style, {
			height: `${box.height}px`,
			left: `${box.x}px`,
			top: `${box.y}px`,
			width: `${box.width}px`,
		})
		return
	}

	const style = getComputedStyle(item)
	const width = Math.max(
		home.width - lengthOf(style.borderLeftWidth) - lengthOf(style.borderRightWidth),
		1,
	)
	const height = Math.max(
		home.height - lengthOf(style.borderTopWidth) - lengthOf(style.borderBottomWidth),
		1,
	)
	Object.assign(element.style, {
		height: `${(box.height / height) * 100}%`,
		left: `${(box.x / width) * 100}%`,
		top: `${(box.y / height) * 100}%`,
		width: `${(box.width / width) * 100}%`,
	})
}

/**
 * A preview of the kit's player: its poster while that is showing, or else its
 * video's frames. The video lives in the media element's shadow root for
 * streaming services, and in the light DOM for local files. Embedded players
 * without a poster reserve space only.
 */
function playerPlaceholder(container: Element, frame: VideoPreviewFrame): HTMLElement | undefined {
	const poster = container.closest('video-player')?.getAttribute('poster') ?? ''
	if (poster !== '' && container.querySelector('media-poster[data-visible]') !== null) {
		const image = document.createElement('img')
		image.alt = ''
		image.decoding = 'sync'
		image.src = poster
		return image
	}

	const media = container.querySelector('.amk-media')
	const video =
		media instanceof HTMLVideoElement ? media : media?.shadowRoot?.querySelector('video')
	if (!(video instanceof HTMLVideoElement)) {
		return undefined
	}

	if (typeof video.requestVideoFrameCallback === 'function') {
		const canvas = document.createElement('canvas')
		disposers.set(canvas, mirrorVideo(video, canvas, frame))
		return canvas
	}

	return snapshot(video, frame)
}

function snapshot(
	element: HTMLCanvasElement | HTMLVideoElement,
	frame: VideoPreviewFrame,
): HTMLCanvasElement | undefined {
	let width: number
	let height: number
	if (element instanceof HTMLCanvasElement) {
		width = element.width
		height = element.height
	} else if (element instanceof HTMLVideoElement && element.readyState >= 2) {
		width = element.videoWidth
		height = element.videoHeight
	} else {
		return undefined
	}

	const size = Math.max(frame.width, frame.height)
	if (width <= 0 || height <= 0 || size <= 0) {
		return undefined
	}

	const canvas = document.createElement('canvas')
	if (element instanceof HTMLVideoElement) {
		const dimensions = videoPreviewSize(element, frame)
		canvas.width = dimensions.width
		canvas.height = dimensions.height
	} else {
		// Canvas subjects retain the one-megapixel and 2x thumbnail limits.
		const scale = Math.min(
			1,
			(size * Math.min(devicePixelRatio, 2)) / Math.max(width, height),
			Math.sqrt(1_048_576 / (width * height)),
		)
		canvas.width = Math.max(1, Math.round(width * scale))
		canvas.height = Math.max(1, Math.round(height * scale))
	}

	const context = previewContext(canvas)
	if (context === undefined) {
		return undefined
	}

	try {
		context.drawImage(element, 0, 0, canvas.width, canvas.height)
		return canvas
	} catch {
		// A source can become unavailable between checking it and drawing it.
		canvas.width = 0
		canvas.height = 0
		return undefined
	}
}

/** Stop live rendering, release bitmap memory, and remove a placeholder. */
export function removePlaceholder(placeholder: HTMLElement | undefined) {
	if (placeholder === undefined) {
		return
	}

	disposers.get(placeholder)?.()
	disposers.delete(placeholder)
	placeholder.remove()
	if (!(placeholder instanceof HTMLCanvasElement)) {
		return
	}

	placeholder.width = 0
	placeholder.height = 0
}
