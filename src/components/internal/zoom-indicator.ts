import { subscribeMediaIconTheme } from './media-theme'

let installed = false
let disposeTheme: (() => void) | undefined

function disposeIndicators() {
	disposeTheme?.()
	disposeTheme = undefined
}

function setUpIndicators() {
	disposeIndicators()
	disposeTheme = subscribeMediaIconTheme(
		document.querySelectorAll<HTMLElement>('.amk-zoom-indicator[data-amk-icon="expand"]'),
	)
}

/** Follow document theme changes without loading player components. */
export function installZoomIndicators() {
	if (installed) {
		return
	}

	installed = true
	setUpIndicators()
	document.addEventListener('astro:before-swap', disposeIndicators)
	document.addEventListener('astro:page-load', setUpIndicators)
}
