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
 * Whether a subject is ordinary markup, which a copy of stays inert: no player,
 * custom component, embed, or form control that would start up a second time.
 */
export function isPlainMarkup(subject: Element): boolean {
	return [subject, ...subject.querySelectorAll('*')].every(
		(element) =>
			!element.localName.includes('-') &&
			!element.hasAttribute('is') &&
			element.shadowRoot === null &&
			!element.matches(
				'iframe, object, embed, video, audio, canvas, script, style, link, template, form, input, select, textarea',
			),
	)
}

/**
 * Copy ordinary markup without initializing another player or custom component.
 * Image copies follow their originals until `signal` aborts.
 */
export function clonePlaceholder(subject: Element, signal: AbortSignal): HTMLElement | undefined {
	if (!isPlainMarkup(subject)) {
		return undefined
	}

	const originals = [subject, ...subject.querySelectorAll('*')]

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
				const value = attribute.value.replaceAll(
					fragmentUrl,
					(match: string, _quote: string, id: string) =>
						ids.has(id) ? `url(#${ids.get(id)!})` : match,
				)
				// Reassigning an unchanged image URL can restart its load in WebKit.
				if (value !== attribute.value) {
					attribute.value = value
				}
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

	copyDisplayedImage(original, copy, 'sync')
	const update = async () => {
		const source = original.currentSrc
		try {
			await original.decode()
		} catch {
			// Keep the displayed copy when a replacement fails or is superseded.
			return
		}

		if (!signal.aborted && original.currentSrc === source) {
			// The page copy can need a different raster size than the viewer.
			// Its later upgrades must not hold up painting the scrolling gallery.
			copyDisplayedImage(original, copy, 'async')
		}
	}

	original.addEventListener(
		'load',
		() => {
			// Keep the page thumbnail until the replacement has decoded; a load
			// event only guarantees downloaded bytes.
			void update()
		},
		{ signal },
	)
}

/** Reuse the displayed bitmap before the copy replaces its original. */
function copyDisplayedImage(
	original: HTMLImageElement,
	copy: HTMLImageElement,
	decoding: 'async' | 'sync',
) {
	const { currentSrc } = original
	if (currentSrc === '') {
		return
	}

	// WebKit can paint a lazy copy empty for a frame after the original moves.
	// Reuse the initial displayed resource synchronously, then allow later
	// upgrades to decode asynchronously. Pin picture sources too: making
	// sizes="auto" eager changes source selection.
	copy.loading = 'eager'
	copy.decoding = decoding
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
