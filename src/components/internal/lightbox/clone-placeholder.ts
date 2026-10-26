import { restorePreparedClone } from './prepare'

const whitespace = /\s+/v
const fragmentUrl = /url\((['"]?)#([^\)'"\s]+)\1\)/gv
let sequence = 0
const references = new Set([
	'aria-activedescendant',
	'aria-controls',
	'aria-describedby',
	'aria-details',
	'aria-errormessage',
	'aria-flowto',
	'aria-labelledby',
	'aria-owns',
	'for',
	'headers',
	'list',
])

/**
 * Copy ordinary markup without initializing another player or custom component.
 * Image copies follow their originals until `signal` aborts.
 */
export function clonePlaceholder(subject: Element, signal: AbortSignal): HTMLElement | undefined {
	const originals = [subject, ...subject.querySelectorAll('*')]
	if (
		originals.some(
			(element) =>
				element.localName.includes('-') ||
				element.hasAttribute('is') ||
				element.shadowRoot !== null ||
				element.matches(
					'iframe, object, embed, video, audio, canvas, script, style, link, template, form, input, select, textarea',
				),
		)
	) {
		return undefined
	}

	const clone = subject.cloneNode(true)
	if (!(clone instanceof Element)) {
		return undefined
	}

	restorePreparedClone(subject, clone)
	const elements = [clone, ...clone.querySelectorAll('*')]
	for (const [index, element] of elements.entries()) {
		followDisplayedImage(originals[index]!, element, signal)
	}

	const prefix = `amk-preview-${++sequence}-`
	const ids = new Map<string, string>()
	for (const element of elements) {
		if (element.id === '') {
			continue
		}

		const id = `${prefix}${ids.size}`
		ids.set(element.id, id)
		element.id = id
	}

	for (const element of elements) {
		for (const name of element.getAttributeNames()) {
			const attribute = element.getAttributeNode(name)!
			if (name === 'autofocus' || name.startsWith('on')) {
				element.removeAttribute(name)
			} else if (references.has(name)) {
				attribute.value = attribute.value
					.split(whitespace)
					.map((id) => ids.get(id) ?? id)
					.join(' ')
			} else if ((name === 'href' || name === 'xlink:href') && attribute.value.startsWith('#')) {
				attribute.value = `#${ids.get(attribute.value.slice(1)) ?? attribute.value.slice(1)}`
			} else {
				attribute.value = attribute.value.replaceAll(
					fragmentUrl,
					(match: string, _quote: string, id: string) =>
						ids.has(id) ? `url(#${ids.get(id)!})` : match,
				)
			}
		}

		if (!(element instanceof HTMLButtonElement)) {
			continue
		}

		// Inert buttons must not acquire form or command behavior on the page.
		element.type = 'button'
		element.removeAttribute('form')
		element.removeAttribute('name')
		element.removeAttribute('commandfor')
	}

	if (clone instanceof HTMLElement) {
		return clone
	}

	const wrapper = document.createElement('div')
	wrapper.append(clone)
	return wrapper
}

/**
 * Show the displayed bitmap, and keep showing whatever the original displays as
 * it loads a larger candidate in the viewer, so the copy blends with the
 * original and lands on the same pixels.
 */
function followDisplayedImage(original: Element, copy: Element, signal: AbortSignal) {
	if (!(original instanceof HTMLImageElement) || !(copy instanceof HTMLImageElement)) {
		return
	}

	copyDisplayedImage(original, copy)
	original.addEventListener(
		'load',
		() => {
			copyDisplayedImage(original, copy)
		},
		{ signal },
	)
}

/** Reuse the displayed bitmap before the copy replaces its original. */
function copyDisplayedImage(original: HTMLImageElement, copy: HTMLImageElement) {
	const { currentSrc } = original
	if (currentSrc === '') {
		return
	}

	// WebKit can paint a lazy copy empty for a frame after the original moves.
	// Reuse the displayed resource eagerly, with synchronous decoding. Pin
	// picture sources too: making sizes="auto" eager changes source selection.
	copy.loading = 'eager'
	copy.decoding = 'sync'
	copy.removeAttribute('srcset')
	const sources = copy.closest('picture')?.querySelectorAll('source') ?? []
	for (const source of sources) {
		if (source.srcset !== currentSrc) {
			source.srcset = currentSrc
		}
	}

	// Setting the same URL again would restart the load
	if (copy.src !== currentSrc) {
		copy.src = currentSrc
	}
}
