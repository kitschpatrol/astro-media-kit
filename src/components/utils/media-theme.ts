import { parseHTML } from 'linkedom'
import type { MediaIconName } from '../media-icon-names'
import { mediaIconNames } from '../media-icon-names'

/** Validate an icon slot and normalize its SVG as decorative artwork. */
export function parseMediaThemeIcon(
	slot: string,
	markup: string,
): { markup: string; name: MediaIconName } {
	const name = mediaIconNames.find((name) => slot === `icon-${name}`)
	if (name === undefined) {
		throw new TypeError(`[astro-media-kit] Unknown MediaTheme slot "${slot}".`)
	}

	const { document } = parseHTML(`<html><body>${markup}</body></html>`)
	const svg = document.body.firstElementChild
	const hasText = [...document.body.childNodes].some(
		(node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '',
	)
	if (hasText || document.body.children.length !== 1 || svg?.localName !== 'svg') {
		throw new TypeError(`[astro-media-kit] MediaTheme slot "${slot}" must render one SVG.`)
	}

	svg.removeAttribute('slot')
	svg.setAttribute('aria-hidden', 'true')
	svg.setAttribute('focusable', 'false')
	return { markup: svg.outerHTML, name }
}
