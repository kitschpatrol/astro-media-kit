import type { MediaIconName } from '../media-icon-names'
import { mediaIconNames } from '../media-icon-names'

type Icons = Partial<Record<MediaIconName, string>>
type Listener = (icons: Icons) => void

const listeners = new Set<Listener>()

/** Read only the current document's optional icon templates. */
function readIcons(): Icons {
	const icons: Icons = {}
	const theme = document.querySelector<HTMLTemplateElement>('template[data-amk-media-theme]')
	const templates =
		theme?.content.querySelectorAll<HTMLTemplateElement>('template[data-amk-icon]') ?? []
	for (const template of templates) {
		const name = mediaIconNames.find((name) => name === template.dataset.amkIcon)
		const svg = template.content.firstElementChild
		if (name !== undefined && svg?.localName === 'svg') {
			icons[name] = svg.outerHTML
		}
	}

	return icons
}

/** Refresh overrides after a page swap, including removal of the theme. */
function updateTheme() {
	const icons = readIcons()
	for (const listener of listeners) {
		listener(icons)
	}
}

/** Follow the current page's theme, immediately and after Astro navigation. */
export function subscribeMediaTheme(listener: Listener): () => void {
	listeners.add(listener)
	listener(readIcons())
	return () => {
		listeners.delete(listener)
	}
}

/** Theme ordinary icon wrappers, retaining each one's built-in fallback. */
export function subscribeMediaIconTheme(elements: Iterable<HTMLElement>): () => void {
	const icons = Array.from(elements, (element) => ({
		element,
		fallback: element.innerHTML,
		name: mediaIconNames.find((name) => name === element.dataset.amkIcon),
	}))
	const unsubscribe = subscribeMediaTheme((overrides) => {
		for (const { element, fallback, name } of icons) {
			const iconMarkup = name === undefined ? undefined : overrides[name]
			element.innerHTML = iconMarkup ?? fallback
		}
	})
	return () => {
		unsubscribe()
		for (const { element, fallback } of icons) {
			element.innerHTML = fallback
		}
	}
}

document.addEventListener('astro:page-load', updateTheme)
