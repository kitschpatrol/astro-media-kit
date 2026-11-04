import { rendered } from './dom'
import { refreshImagePreview } from './image-preview'
import { ratioOf } from './media'

type SavedAttribute = {
	element: Element
	name: string
	original: string | undefined
	written: string
}

type Preparation = {
	attributes: SavedAttribute[]
	controller: AbortController
	image: HTMLImageElement
	width: number
}

const preparations = new WeakMap<Element, Preparation>()

/**
 * Warm a responsive image on its original node, leaving picture selection to
 * the browser. Decoding is best effort and never delays opening. A load handler
 * also decodes a replacement that arrives after the initial decode attempt.
 */
export function prepareImage(subject: Element, width: number) {
	const image = rendered(subject)
	if (!(image instanceof HTMLImageElement) || !Number.isFinite(width) || width <= 0) {
		return
	}

	const previous = preparations.get(subject)
	if (previous?.image === image && previous.width >= width) {
		return
	}

	releasePreparation(subject)
	refreshImagePreview(subject)
	const controller = new AbortController()
	const preparation: Preparation = { attributes: [], controller, image, width }
	preparations.set(subject, preparation)
	const picture = image.closest('picture')
	const sources = picture === null ? [] : [...picture.querySelectorAll('source')]
	for (const element of [...sources, image]) {
		setAttribute(preparation, element, 'sizes', `${Math.ceil(width)}px`)
	}

	// Explicit sizes remain valid while eager loading warms an offscreen target.
	if (image.loading === 'lazy') {
		setAttribute(preparation, image, 'loading', 'eager')
	}

	const decode = () => {
		if (!controller.signal.aborted) {
			// A replaced request or failed image must not surface as an unhandled rejection.
			void image.decode().catch(() => {
				// A new candidate or a failed request can cancel decoding.
			})
		}
	}

	image.addEventListener('load', decode, { signal: controller.signal })
	// Give source selection an opportunity to process the changed sizing hints.
	queueMicrotask(decode)
}

/**
 * Restore attributes still owned by this preparation, without undoing author
 * edits.
 */
export function releasePreparation(subject: Element) {
	const preparation = preparations.get(subject)
	if (preparation === undefined) {
		return
	}

	preparation.controller.abort()
	preparations.delete(subject)
	restoreAttributes(preparation.attributes)
}

/**
 * Give a decorative clone the page sizing hints, not the original's temporary
 * preparation hints.
 */
export function restorePreparedClone(subject: Element, clone: Element) {
	const preparation = preparations.get(subject)
	if (preparation === undefined) {
		return
	}

	const originals = [subject, ...subject.querySelectorAll('*')]
	const copies = [clone, ...clone.querySelectorAll('*')]
	for (const attribute of preparation.attributes) {
		const element = copies[originals.indexOf(attribute.element)]
		if (element !== undefined) {
			restoreAttributes([{ ...attribute, element }])
		}
	}
}

function restoreAttributes(attributes: SavedAttribute[]) {
	for (const { element, name, original, written } of attributes) {
		if (element.getAttribute(name) !== written) {
			continue
		}

		if (original === undefined) {
			element.toggleAttribute(name, false)
		} else {
			element.setAttribute(name, original)
		}
	}
}

/** Estimate a fitted image's display width without creating or lifting a viewer. */
export function fittedWidth(subject: Element): number {
	const element = rendered(subject)
	return Math.min(
		window.innerWidth,
		window.innerHeight * ratioOf(element, element.getBoundingClientRect()),
	)
}

function setAttribute(preparation: Preparation, element: Element, name: string, written: string) {
	preparation.attributes.push({
		element,
		name,
		original: element.getAttribute(name) ?? undefined,
		written,
	})
	element.setAttribute(name, written)
}
