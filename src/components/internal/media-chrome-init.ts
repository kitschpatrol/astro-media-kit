/**
 * Shared client-side initialization for media-chrome video components.
 * Imported by each internal video component's `<script>` tag.
 */

// Prevent fullscreen buttons used as zoom triggers from entering native
// fullscreen. The lightbox click handler on .pswp-video-trigger opens
// PhotoSwipe instead.
for (const button of document.querySelectorAll<HTMLElement>(
	'media-fullscreen-button.pswp-video-trigger',
)) {
	button.addEventListener('mediaenterfullscreenrequest', (event) => {
		event.stopPropagation()
		event.preventDefault()
	})
}

// Lightbox mode: hide controls when inactive, even while paused/ended.
// Media-chrome's shadow DOM CSS keeps controls visible when mediapaused
// is set. Shadow DOM ::slotted() rules can't be overridden from light DOM,
// so we toggle inline styles via the userinactivechange event.
for (const controller of document.querySelectorAll<HTMLElement>('media-controller.lightbox')) {
	const controlBar = controller.querySelector<HTMLElement>('media-control-bar')
	if (!controlBar) continue

	const { style } = controlBar
	const update = () => {
		if (controller.hasAttribute('userinactive')) {
			style.opacity = '0'
			style.pointerEvents = 'none'
		} else {
			style.opacity = ''
			style.pointerEvents = ''
		}
	}

	controller.addEventListener('userinactivechange', update)
	update()
}
