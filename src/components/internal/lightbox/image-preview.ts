import { previewContext } from './canvas-context'
import { rendered } from './dom'

type RetainedImage = {
	canvas: HTMLCanvasElement
	destroy: () => void
	lift: (layer: HTMLElement) => void
	pending: () => boolean
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
	const canvas = document.createElement('canvas')
	canvas.className = 'amk-lightbox-image-preview'
	canvas.ariaHidden = 'true'
	canvas.inert = true
	let image: HTMLImageElement | undefined
	let hasPixels = false
	let pending = false
	let generation = 0
	let frame = 0
	let targetLayer = layer
	let home: HTMLElement | undefined

	const capture = (source: HTMLImageElement): boolean => {
		if (!source.complete || source.naturalWidth === 0) {
			return false
		}

		const bounds = source.getBoundingClientRect()
		const ratio = source.naturalWidth / source.naturalHeight
		// Keep enough detail for the fitted viewer: responsive images can have
		// more decoded pixels than their density-corrected thumbnail dimensions.
		// Cap the temporary bitmap at one megapixel instead of copying originals.
		const fittedWidth = Math.min(window.innerWidth, window.innerHeight * ratio)
		const width = Math.min(
			Math.max(bounds.width, fittedWidth, 1) * devicePixelRatio,
			Math.sqrt(1_048_576 * ratio),
		)
		const next = document.createElement('canvas')
		next.width = Math.max(1, Math.round(width))
		next.height = Math.max(1, Math.round(width / ratio))
		const context = previewContext(next)
		const destination = previewContext(canvas)
		if (context === undefined || destination === undefined) {
			return false
		}

		try {
			context.drawImage(source, 0, 0, next.width, next.height)
			canvas.width = next.width
			canvas.height = next.height
			destination.drawImage(next, 0, 0)
		} catch {
			return false
		} finally {
			next.width = 0
			next.height = 0
		}

		const style = getComputedStyle(source)
		for (const property of presentation) {
			canvas.style.setProperty(property, style.getPropertyValue(property))
		}

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
		canvas.remove()
		if (home !== undefined) {
			destroy()
		}
	}

	const refresh = () => {
		const visible = rendered(subject)
		if (!(visible instanceof HTMLImageElement)) {
			return
		}

		if (image !== visible) {
			image?.removeAttribute('data-zoom-image-pending')
			image = visible
			pending = false
		}

		if (!pending) {
			hasPixels = capture(visible) || hasPixels
		}

		if (hasPixels) {
			pending = true
			visible.dataset.zoomImagePending = ''
			// Inside the image's picture, ancestor styling still applies. A bare
			// image's companion travels in its layer instead of staying on the page.
			const parent = visible === subject && home === undefined ? targetLayer : visible.parentElement
			parent?.append(canvas)
			if (home !== undefined) {
				placeReturned(canvas, visible, home)
			}
		}

		const token = ++generation
		cancelAnimationFrame(frame)
		// Let automatic sizes and the new layout select their request first.
		frame = requestAnimationFrame(() => {
			void settle(token)
		})
	}

	const observer = new MutationObserver(refresh)
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
	subject.addEventListener('load', refresh, { capture: true, signal })
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refresh, { signal })
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
			canvas.style.removeProperty(property)
		}
	}

	const destroy = () => {
		controller.abort()
		observer.disconnect()
		themeObserver.disconnect()
		leaveHome()
		cancelAnimationFrame(frame)
		image?.removeAttribute('data-zoom-image-pending')
		canvas.remove()
		canvas.width = 0
		canvas.height = 0
		retained.delete(subject)
	}

	document.addEventListener('astro:before-swap', destroy, { signal })
	retained.set(subject, {
		canvas,
		destroy,
		lift(nextLayer) {
			leaveHome()
			targetLayer = nextLayer
			refresh()
		},
		pending: () => pending,
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
export function copyRetainedImage(subject: Element): HTMLCanvasElement | undefined {
	const state = retained.get(subject)
	if (state?.pending() !== true || state.canvas.width === 0) {
		return undefined
	}

	const copy = document.createElement('canvas')
	copy.width = state.canvas.width
	copy.height = state.canvas.height
	const context = previewContext(copy)
	if (context === undefined) {
		return undefined
	}

	context.drawImage(state.canvas, 0, 0)
	for (const property of presentation) {
		copy.style.setProperty(property, state.canvas.style.getPropertyValue(property))
	}

	return copy
}

function placeReturned(canvas: HTMLCanvasElement, image: HTMLImageElement, item: HTMLElement) {
	const origin = canvas.offsetParent instanceof HTMLElement ? canvas.offsetParent : item
	const bounds = origin.getBoundingClientRect()
	const box = image.getBoundingClientRect()
	const scaleX = bounds.width / Math.max(origin.offsetWidth, 1)
	const scaleY = bounds.height / Math.max(origin.offsetHeight, 1)
	const values = {
		height: `${box.height / (scaleY > 0 ? scaleY : 1)}px`,
		inset: 'auto',
		left: `${(box.left - bounds.left) / (scaleX > 0 ? scaleX : 1) - origin.clientLeft + origin.scrollLeft}px`,
		'object-fit': getComputedStyle(image).objectFit,
		top: `${(box.top - bounds.top) / (scaleY > 0 ? scaleY : 1) - origin.clientTop + origin.scrollTop}px`,
		width: `${box.width / (scaleX > 0 ? scaleX : 1)}px`,
	}
	for (const [property, value] of Object.entries(values)) {
		canvas.style.setProperty(property, value, 'important')
	}
}
