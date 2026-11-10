import { previewContext } from './canvas-context'
import { rendered } from './dom'
import { drawnScale } from './geometry'

type ImagePreview = HTMLCanvasElement | HTMLImageElement

type RetainedImage = {
	destroy: () => void
	lift: (layer: HTMLElement) => void
	pending: () => boolean
	preview: ImagePreview
	refresh: () => void
	returnTo: (item: HTMLElement) => void
}

const retained = new WeakMap<Element, RetainedImage>()
const presentation = [
	'background',
	'border',
	'border-radius',
	'box-shadow',
	'clip-path',
	'filter',
	'image-rendering',
	'object-position',
	'opacity',
	'outline',
	'padding',
]

/** Keep loaded pixels available while moving or enlarging a responsive image. */
export function retainImage(subject: Element, layer: HTMLElement) {
	const previous = retained.get(subject)
	if (previous !== undefined) {
		previous.lift(layer)
		return
	}

	if (!(rendered(subject) instanceof HTMLImageElement)) {
		return
	}

	const controller = new AbortController()
	const { signal } = controller
	// An image preview must stay outside the original picture's source selection,
	// while still inheriting its presentation, including selector-based themes.
	const container = document.createElement('span')
	container.style.display = 'contents'
	let preview: ImagePreview = document.createElement('canvas')
	preview.className = 'amk-lightbox-image-preview'
	preview.ariaHidden = 'true'
	preview.inert = true
	container.append(preview)
	let image: HTMLImageElement | undefined
	let hasPixels = false
	let pending = false
	let generation = 0
	let frame = 0
	let targetLayer = layer
	let home: HTMLElement | undefined

	const capture = (source: HTMLImageElement): boolean => {
		const next = snapshot(source)
		if (next === undefined) {
			return false
		}

		next.className = preview.className
		next.ariaHidden = preview.ariaHidden
		next.inert = preview.inert
		next.style.cssText = preview.style.cssText
		const style = getComputedStyle(source)
		for (const property of presentation) {
			next.style.setProperty(property, style.getPropertyValue(property))
		}

		// Keep the new preview itself. Copying a canvas into another canvas
		// flushes deferred drawing and can decode the image on the main thread.
		const replaced = preview
		preview = next
		replaced.replaceWith(next)
		replaced.width = 0
		replaced.height = 0
		return true
	}

	const settle = async (token: number) => {
		const current = image
		if (current === undefined) {
			return
		}

		try {
			await current.decode()
		} catch {
			// A superseded or failed request keeps the last good pixels on screen.
			return
		}

		if (token !== generation || signal.aborted || !current.complete || current.naturalWidth === 0) {
			return
		}

		delete current.dataset.zoomImagePending
		pending = false
		// Save the newly decoded candidate for later resize/zoom upgrades.
		hasPixels = capture(current) || hasPixels
		container.remove()
		if (home !== undefined) {
			destroy()
		}
	}

	const refresh = (captureCurrent = true) => {
		const visible = rendered(subject)
		if (!(visible instanceof HTMLImageElement)) {
			return
		}

		if (image !== visible) {
			image?.removeAttribute('data-zoom-image-pending')
			image = visible
			pending = false
		}

		if (captureCurrent && !pending) {
			hasPixels = capture(visible) || hasPixels
		}

		if (hasPixels) {
			pending = true
			visible.dataset.zoomImagePending = ''
			// Inside the image's picture, ancestor styling still applies. A bare
			// image's companion travels in its layer instead of staying on the page.
			const parent = visible === subject && home === undefined ? targetLayer : visible.parentElement
			parent?.append(container)
			if (home !== undefined) {
				placeReturned(preview, visible, home)
			}
		}

		const token = ++generation
		cancelAnimationFrame(frame)
		// Let automatic sizes and the new layout select their request first.
		frame = requestAnimationFrame(() => {
			void settle(token)
		})
	}

	const observer = new MutationObserver(() => {
		refresh()
	})
	observer.observe(subject, {
		attributeFilter: ['src', 'srcset', 'sizes', 'media'],
		attributes: true,
		subtree: true,
	})
	// Selector-based picture themes can switch the displayed img without a load
	// event. Only a different displayed image needs another retained handoff.
	const themeObserver = new MutationObserver(() => {
		if (rendered(subject) !== image) {
			refresh()
		}
	})
	themeObserver.observe(document.documentElement, { attributes: true })
	themeObserver.observe(document.body, { attributes: true })
	subject.addEventListener(
		'load',
		(event) => {
			// A retained image can load too; only the displayed original changes
			// which pixels need retaining.
			if (event.target !== image) {
				return
			}

			// Downloaded bytes may still need decoding. Without an earlier
			// thumbnail, drawImage here would force that work into this frame.
			refresh(false)
		},
		{ capture: true, signal },
	)
	matchMedia('(prefers-color-scheme: dark)').addEventListener(
		'change',
		() => {
			refresh()
		},
		{ signal },
	)
	const homeResize = new ResizeObserver(() => {
		if (home !== undefined) {
			refresh()
		}
	})
	const removal = new MutationObserver(() => {
		if (home !== undefined && (!home.isConnected || !home.contains(subject))) {
			destroy()
		}
	})
	const leaveHome = () => {
		home?.removeAttribute('data-image-returning')
		home = undefined
		homeResize.disconnect()
		removal.disconnect()
		for (const property of ['inset', 'left', 'top', 'width', 'height', 'object-fit']) {
			preview.style.removeProperty(property)
		}
	}

	const destroy = () => {
		controller.abort()
		observer.disconnect()
		themeObserver.disconnect()
		leaveHome()
		cancelAnimationFrame(frame)
		image?.removeAttribute('data-zoom-image-pending')
		container.remove()
		preview.width = 0
		preview.height = 0
		retained.delete(subject)
	}

	document.addEventListener('astro:before-swap', destroy, { signal })
	retained.set(subject, {
		destroy,
		lift(nextLayer) {
			leaveHome()
			targetLayer = nextLayer
			refresh()
		},
		pending: () => pending,
		get preview() {
			return preview
		},
		refresh,
		returnTo(item) {
			if (!pending) {
				destroy()
				return
			}

			home = item
			item.dataset.imageReturning = ''
			homeResize.observe(item)
			removal.observe(document.body, { childList: true, subtree: true })
			refresh()
		},
	})
	refresh()
}

/** Cover another sizing change with the last successfully displayed candidate. */
export function refreshImagePreview(subject: Element) {
	retained.get(subject)?.refresh()
}

/** Release listeners and bitmap memory when the real image returns to the page. */
export function releaseImagePreview(subject: Element) {
	retained.get(subject)?.destroy()
}

/** Keep the returned thumbnail visible too if its request is still pending. */
export function returnImagePreview(subject: Element, item: HTMLElement) {
	retained.get(subject)?.returnTo(item)
}

/** Give an immediate reopen a page preview even while its real img is pending. */
export function copyRetainedImage(subject: Element): ImagePreview | undefined {
	const state = retained.get(subject)
	if (state?.pending() !== true || state.preview.width === 0) {
		return undefined
	}

	let copy: ImagePreview | undefined
	if (state.preview instanceof HTMLImageElement) {
		copy = snapshot(state.preview)
	} else {
		const canvas = document.createElement('canvas')
		canvas.width = state.preview.width
		canvas.height = state.preview.height
		const context = previewContext(canvas)
		if (context !== undefined) {
			context.drawImage(state.preview, 0, 0)
			copy = canvas
		}
	}

	if (copy !== undefined) {
		for (const property of presentation) {
			copy.style.setProperty(property, state.preview.style.getPropertyValue(property))
		}
	}

	return copy
}

function placeReturned(preview: ImagePreview, image: HTMLImageElement, item: HTMLElement) {
	const origin = preview.offsetParent instanceof HTMLElement ? preview.offsetParent : item
	const bounds = origin.getBoundingClientRect()
	const box = image.getBoundingClientRect()
	const scale = drawnScale(origin, bounds)
	const values = {
		height: `${box.height / scale.y}px`,
		inset: 'auto',
		left: `${(box.left - bounds.left) / scale.x - origin.clientLeft + origin.scrollLeft}px`,
		'object-fit': getComputedStyle(image).objectFit,
		top: `${(box.top - bounds.top) / scale.y - origin.clientTop + origin.scrollTop}px`,
		width: `${box.width / scale.x}px`,
	}
	for (const [property, value] of Object.entries(values)) {
		preview.style.setProperty(property, value, 'important')
	}
}

/** Reuse a cached image; retain pixels when a new element must revalidate it. */
function snapshot(source: HTMLImageElement): ImagePreview | undefined {
	if (!source.complete || source.naturalWidth === 0) {
		return undefined
	}

	const image = new Image()
	image.crossOrigin = source.crossOrigin
	image.referrerPolicy = source.referrerPolicy
	image.decoding = 'async'
	image.src = source.currentSrc
	if (image.complete && image.naturalWidth > 0) {
		// Canvas uses a separate decode cache in Chromium: even after decode(),
		// drawing a large image there can decode it again during scrolling.
		return image
	}

	const bounds = source.getBoundingClientRect()
	const ratio = source.naturalWidth / source.naturalHeight
	// Keep the fitted detail available from a responsive thumbnail, bounded to
	// one megapixel rather than copying the original at full resolution.
	const fittedWidth = Math.min(window.innerWidth, window.innerHeight * ratio)
	const width = Math.min(
		Math.max(bounds.width, fittedWidth, 1) * devicePixelRatio,
		Math.sqrt(1_048_576 * ratio),
	)
	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.round(width))
	canvas.height = Math.max(1, Math.round(width / ratio))
	const context = previewContext(canvas)
	if (context === undefined) {
		return undefined
	}

	try {
		context.drawImage(source, 0, 0, canvas.width, canvas.height)
		return canvas
	} catch {
		canvas.width = 0
		canvas.height = 0
		return undefined
	}
}
