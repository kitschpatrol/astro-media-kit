import { rendered } from './dom'
import { prepareImage, releasePreparation } from './prepare'

type Warmup = { image: HTMLImageElement; picture: HTMLPictureElement; width: number }
const warmups = new WeakMap<Element, Warmup>()

/** Warm the browser-selected candidate without changing the visible thumbnail. */
export function warmImage(subject: Element, width: number) {
	const original = rendered(subject)
	if (!(original instanceof HTMLImageElement) || !Number.isFinite(width) || width <= 0) {
		return
	}

	const previous = warmups.get(subject)
	if (previous?.image === original && previous.width >= width) {
		return
	}

	releaseWarmup(subject)
	// Copy only source-selection attributes: no IDs, handlers, or custom elements.
	const picture = document.createElement('picture')
	const originalPicture = original.closest('picture')
	if (originalPicture !== null) {
		for (const source of originalPicture.querySelectorAll('source')) {
			const copy = document.createElement('source')
			copyAttributes(source, copy, ['type', 'media', 'srcset', 'width', 'height'])
			copy.sizes = `${Math.ceil(width)}px`
			picture.append(copy)
		}
	}

	const image = document.createElement('img')
	image.referrerPolicy = original.referrerPolicy
	image.sizes = `${Math.ceil(width)}px`
	picture.append(image)
	copyAttributes(original, image, ['crossorigin', 'srcset', 'src'])
	warmups.set(subject, { image: original, picture, width })
	prepareImage(picture, width)
}

/** Release detached decode work and its references when intent ends. */
export function releaseWarmup(subject: Element) {
	const warmup = warmups.get(subject)
	if (warmup === undefined) {
		return
	}

	releasePreparation(warmup.picture)
	warmups.delete(subject)
}

function copyAttributes(source: Element, target: Element, names: string[]) {
	for (const name of names) {
		const value = source.getAttribute(name)
		if (value !== null) {
			target.setAttribute(name, value)
		}
	}
}
