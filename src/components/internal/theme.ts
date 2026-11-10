import {
	captionsOffIcon,
	captionsOnIcon,
	checkIcon,
	fullscreenEnterIcon,
	fullscreenExitIcon,
	pauseIcon,
	playIcon,
	restartIcon,
	seekIcon,
	spinnerIcon,
	volumeHighIcon,
	volumeLowIcon,
	volumeOffIcon,
} from '@videojs/html/icons'
import type { MediaIconName } from '../media-icon-names'
import { closeIcon, nextIcon, previousIcon, zoomInIcon, zoomOutIcon } from './gallery-icons'
import { collapseIcon, expandIcon } from './zoom-icons'

/**
 * The site's own icons, as the `mediaKit()` integration hands them to the
 * build: SVG markup by icon name.
 */
export type ThemeOverrides = {
	icons?: Partial<Record<MediaIconName, string>>
}

// Replaced with the configured theme when the integration builds the site.
// Without the integration nothing defines it, and the built-in artwork is used
// eslint-disable-next-line ts/naming-convention -- a build-time constant, named as one
declare const __AMK_THEME__: ThemeOverrides | undefined

const configured: ThemeOverrides = typeof __AMK_THEME__ === 'undefined' ? {} : __AMK_THEME__

const defaultIcons: Record<MediaIconName, string> = {
	'captions-off': captionsOffIcon,
	'captions-on': captionsOnIcon,
	check: checkIcon,
	close: closeIcon,
	collapse: collapseIcon,
	expand: expandIcon,
	'fullscreen-enter': fullscreenEnterIcon,
	'fullscreen-exit': fullscreenExitIcon,
	next: nextIcon,
	pause: pauseIcon,
	play: playIcon,
	previous: previousIcon,
	restart: restartIcon,
	seek: seekIcon,
	spinner: spinnerIcon,
	'volume-high': volumeHighIcon,
	'volume-low': volumeLowIcon,
	'volume-off': volumeOffIcon,
	'zoom-in': zoomInIcon,
	'zoom-out': zoomOutIcon,
}

/**
 * Every icon's SVG markup, for a component to render into the page: the one
 * given to `mediaKit({ icons })`, or else the built-in artwork. Only for
 * templates; a client script that imported this would carry every icon.
 */
export const icons: Record<MediaIconName, string> = { ...defaultIcons, ...configured.icons }
