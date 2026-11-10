import { closeIcon, nextIcon, previousIcon, zoomInIcon, zoomOutIcon } from '../gallery-icons'

/** The icons on the viewer's own buttons. */
type ViewerIconName = 'close' | 'next' | 'previous' | 'zoom-in' | 'zoom-out'

/**
 * The site's own artwork for the viewer, as the `mediaKit()` integration hands
 * it to the build.
 */
export type ViewerTheme = {
	icons?: Partial<Record<ViewerIconName, string>>
}

// Replaced with the configured theme when the integration builds the site.
// Without the integration nothing defines it, and the built-in artwork is used
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

/**
 * The viewer's dialog and its buttons, as markup. Its icons are settled when
 * the site is built, so nothing is themed once the page is running.
 */
export function viewerMarkup(theme: ViewerTheme = configured): string {
	const icons = { ...defaultIcons, ...theme.icons }
	const icon = (name: ViewerIconName) =>
		`<span class="amk-lightbox-icon" data-amk-icon="${name}">${icons[name]}</span>`
	return `
	<dialog class="amk-lightbox" aria-label="Media viewer" tabindex="-1">
		<div class="amk-lightbox-track" tabindex="-1" role="region" aria-roledescription="carousel" aria-label="Gallery"></div>
		<div class="amk-lightbox-status" role="status" aria-live="polite" aria-atomic="true"></div>
		<button class="amk-lightbox-button amk-lightbox-close" type="button" data-action="close" aria-label="Close">
			${icon('close')}
		</button>
		<button class="amk-lightbox-button amk-lightbox-zoom" type="button" data-action="zoom" aria-label="Zoom" aria-pressed="false" hidden>
			${icon('zoom-in')}
			${icon('zoom-out')}
		</button>
		<button class="amk-lightbox-button amk-lightbox-previous" type="button" data-action="previous" aria-label="Previous">
			${icon('previous')}
		</button>
		<button class="amk-lightbox-button amk-lightbox-next" type="button" data-action="next" aria-label="Next">
			${icon('next')}
		</button>
	</dialog>`
}
