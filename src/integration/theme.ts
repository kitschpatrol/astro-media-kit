import { parseHTML } from 'linkedom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MediaIconName } from '../components/media-icon-names'
import { mediaIconNames } from '../components/media-icon-names'
import { escapeAttributeAmpersands } from '../components/utils/html'

/**
 * The site's own artwork for the kit's icons, by icon name. Each is an SVG
 * file, as a path from the project root or a `URL`, or else SVG markup itself.
 * An icon left out keeps its built-in artwork.
 *
 * @example
 * 	mediaKit({
 * 		icons: {
 * 			close: './src/icons/close.svg',
 * 			play: '<svg viewBox="0 0 24 24"><path d="m8 4 12 8-12 8Z" /></svg>',
 * 		},
 * 	})
 */
export type IconsConfig = Partial<Record<MediaIconName, string | URL>>

/** Icons the lightbox's script draws on its own buttons. */
const viewerIconNames = new Set<MediaIconName>(['close', 'next', 'previous', 'zoom-in', 'zoom-out'])

/** Icons as SVG markup, ready for the build, and the files they were read from. */
type ResolvedIcons = {
	files: string[]
	icons: Partial<Record<MediaIconName, string>>
}

/**
 * Read and check every configured icon, so a mistake stops the build with the
 * icon's name in the message, rather than drawing nothing in a page.
 *
 * @param config - The `icons` option of `mediaKit()`.
 * @param root - The project root, which relative paths are resolved from.
 * @throws {TypeError} For a name the kit has no icon by, or a source that is
 *   not exactly one SVG.
 */
export function resolveIcons(config: IconsConfig, root: URL): ResolvedIcons {
	const resolved: ResolvedIcons = { files: [], icons: {} }
	for (const [name, source] of Object.entries(config)) {
		const iconName = mediaIconNames.find((known) => known === name)
		if (iconName === undefined) {
			throw new TypeError(
				`[astro-media-kit] Unknown icon "${name}" in the icons option. The icons are: ${mediaIconNames.join(', ')}.`,
			)
		}

		const isMarkup = typeof source === 'string' && source.trimStart().startsWith('<')
		let markup: string
		if (isMarkup) {
			markup = source
		} else {
			const file =
				source instanceof URL ? fileURLToPath(source) : path.resolve(fileURLToPath(root), source)
			try {
				markup = readFileSync(file, 'utf8')
			} catch (error) {
				throw new TypeError(
					`[astro-media-kit] Could not read the "${name}" icon from "${file}": ${error instanceof Error ? error.message : String(error)}. Give a path from the project root, a URL, or SVG markup.`,
					{ cause: error },
				)
			}

			resolved.files.push(file)
		}

		resolved.icons[iconName] = normalizeIcon(name, markup)
	}

	return resolved
}

/** The part of the configured icons that the lightbox's script needs. */
export function viewerIcons(
	icons: Partial<Record<MediaIconName, string>>,
): Partial<Record<MediaIconName, string>> {
	return Object.fromEntries(
		Object.entries(icons).filter(([name]) => viewerIconNames.has(name as MediaIconName)),
	)
}

/** Check that `markup` is one SVG, and make it decorative. */
function normalizeIcon(name: string, markup: string): string {
	const { document } = parseHTML(`<html><body>${markup}</body></html>`)
	const svg = document.body.firstElementChild
	const hasText = [...document.body.childNodes].some(
		(node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '',
	)
	if (hasText || document.body.children.length !== 1 || svg?.localName !== 'svg') {
		throw new TypeError(`[astro-media-kit] The "${name}" icon must be exactly one SVG element.`)
	}

	// The buttons carry the labels; the artwork is for the eye only
	svg.setAttribute('aria-hidden', 'true')
	svg.setAttribute('focusable', 'false')
	escapeAttributeAmpersands(document.body)
	return svg.outerHTML
}
