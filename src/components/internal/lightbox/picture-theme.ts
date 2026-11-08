const pairSelector = '.amk-picture[data-dark-mode]'

/** Keep selector-based pictures following their page theme while lifted. */
export function retainPictureThemes(subject: Element, item: HTMLElement): () => void {
	const pairs = [...subject.querySelectorAll<HTMLElement>(pairSelector)]
	if (subject instanceof HTMLElement && subject.matches(pairSelector)) {
		pairs.unshift(subject)
	}

	if (pairs.length === 0) {
		return () => {
			// Nothing to restore for media without selector-based picture pairs.
		}
	}

	const themes = pairs.map((pair) => {
		// Keep references to the original ancestors: the paired wrapper itself
		// leaves that selector context when the viewer lifts it.
		const contexts = new Set<Element>()
		for (const root of [pair.parentElement, item]) {
			for (let context = root; context !== null; context = context.parentElement) {
				contexts.add(context)
			}
		}

		return {
			contexts,
			pictures: Array.from(pair.querySelectorAll<HTMLElement>(':scope > picture'), (element) => ({
				display: element.style.getPropertyValue('display'),
				element,
				hadStyle: element.hasAttribute('style'),
				priority: element.style.getPropertyPriority('display'),
				written: '',
			})),
			selector: pair.dataset.darkMode!,
		}
	})
	const update = () => {
		for (const { contexts, pictures, selector } of themes) {
			const dark = [...contexts].some((context) => context.matches(selector))
			for (const picture of pictures) {
				picture.written = dark === picture.element.classList.contains('amk-dark') ? 'block' : 'none'
				picture.element.style.setProperty('display', picture.written, 'important')
			}
		}
	}

	const observer = new MutationObserver(update)
	for (const { contexts } of themes) {
		for (const context of contexts) {
			observer.observe(context, { attributes: true })
		}
	}

	update()
	return () => {
		observer.disconnect()
		for (const { pictures } of themes) {
			for (const { display, element, hadStyle, priority, written } of pictures) {
				// Leave a display value the author changed while lifted alone.
				if (
					element.style.getPropertyValue('display') !== written ||
					element.style.getPropertyPriority('display') !== 'important'
				) {
					continue
				}

				if (display === '') {
					element.style.removeProperty('display')
				} else {
					element.style.setProperty('display', display, priority)
				}

				// Flush WebKit's pending CSSOM serialization before removing the attribute.
				if (!hadStyle && element.getAttribute('style') === '') {
					element.removeAttribute('style')
				}
			}
		}
	}
}
