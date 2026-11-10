import type { Labels } from '../labels'
import { closeIcon, nextIcon, previousIcon, zoomInIcon, zoomOutIcon } from '../gallery-icons'
import { defaultLabels } from '../labels'

/** The icons on the viewer's own buttons. */
type ViewerIconName = 'close' | 'next' | 'previous' | 'zoom-in' | 'zoom-out'

/**
 * The site's own artwork and words for the viewer, as the `mediaKit()`
 * integration hands them to the build.
 */
export type ViewerTheme = {
	icons?: Partial<Record<ViewerIconName, string>>
	labels?: Partial<Labels>
}

// Replaced with the configured theme when the integration builds the site.
// Without the integration nothing defines it, and the built-in artwork and
// English are used
// eslint-disable-next-line ts/naming-convention -- a build-time constant, named as one
declare const __AMK_VIEWER_THEME__: undefined | ViewerTheme

const configured: ViewerTheme =
	typeof __AMK_VIEWER_THEME__ === 'undefined' ? {} : __AMK_VIEWER_THEME__

const defaultIcons: Record<ViewerIconName, string> = {
	close: closeIcon,
	next: nextIcon,
	previous: previousIcon,
	'zoom-in': zoomInIcon,
	'zoom-out': zoomOutIcon,
}

/** The words on the viewer and its slides: the site's own, or else English. */
export const viewerLabels: Labels = { ...defaultLabels, ...configured.labels }

function escapeAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

/**
 * The viewer's dialog and its buttons, as markup. Its icons and labels are
 * settled when the site is built, so nothing is themed once the page is
 * running.
 */
export function viewerMarkup(theme: ViewerTheme = configured): string {
	const icons = { ...defaultIcons, ...theme.icons }
	const labels = { ...defaultLabels, ...theme.labels }
	const icon = (name: ViewerIconName) =>
		`<span class="amk-lightbox-icon" data-amk-icon="${name}">${icons[name]}</span>`
	const label = (name: keyof Labels) => escapeAttribute(labels[name])
	return `
	<dialog class="amk-lightbox" aria-label="${label('viewer')}" tabindex="-1">
		<div class="amk-lightbox-track" tabindex="-1" role="region" aria-roledescription="${label('carouselRole')}" aria-label="${label('gallery')}"></div>
		<div class="amk-lightbox-status" role="status" aria-live="polite" aria-atomic="true"></div>
		<button class="amk-lightbox-button amk-lightbox-close" type="button" data-action="close" aria-label="${label('close')}">
			${icon('close')}
		</button>
		<button class="amk-lightbox-button amk-lightbox-zoom" type="button" data-action="zoom" aria-label="${label('zoom')}" aria-pressed="false" hidden>
			${icon('zoom-in')}
			${icon('zoom-out')}
		</button>
		<button class="amk-lightbox-button amk-lightbox-previous" type="button" data-action="previous" aria-label="${label('previous')}">
			${icon('previous')}
		</button>
		<button class="amk-lightbox-button amk-lightbox-next" type="button" data-action="next" aria-label="${label('next')}">
			${icon('next')}
		</button>
	</dialog>`
}
