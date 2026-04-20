/* eslint-disable ts/no-restricted-types */
/**
 * Shared PhotoSwipe lightbox initialization for both image (Zoomer) and video
 * (Video) components. Supports mixed galleries containing both content types.
 *
 * Images use the default PhotoSwipe image type. Videos use a custom 'video'
 * type — a duplicate player is created in the lightbox (the inline player stays
 * on the page, consistent with how images work). Playback position is synced:
 * the lightbox player seeks to the inline player's current time on open, and
 * the inline player syncs back on close.
 */

import type { HlsVideoElement } from 'hls-video-element'
// @ts-expect-error — no type declarations available for this package
import PhotoSwipeDynamicCaption from 'photoswipe-dynamic-caption-plugin'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import { resolveScopedGalleries } from './zoom-scope'

type LightboxOptions = NonNullable<ConstructorParameters<typeof PhotoSwipeLightbox>[0]>

/**
 * Per-item secondary zoom level. Reads `data-pswp-level` from the triggering
 * element — `'native'` zooms to 1:1 pixels, `'fill'` zooms to cover the
 * viewport, anything else (including absent) keeps the fitted view.
 */
const secondaryZoomLevel: LightboxOptions['secondaryZoomLevel'] = (zoomLevelObject) => {
	const { element } = zoomLevelObject.itemData
	if (element instanceof HTMLElement) {
		if (element.dataset.pswpLevel === 'native') return 1
		if (element.dataset.pswpLevel === 'fill') return zoomLevelObject.fill
	}

	return zoomLevelObject.fit
}

/** Supported video element tag names for lightbox playback. */
type VideoElementTag = 'hls-video' | 'video' | 'vimeo-video' | 'youtube-video'

const VIDEO_ELEMENT_SELECTOR = 'video, hls-video, youtube-video, vimeo-video'

/** Monotonic counter for unique media-controller ids across all lightbox instances. */
let controllerIdCounter = 0

/**
 * Build a floating control bar to be appended outside the PhotoSwipe zoom
 * transform (anchored to the viewport bottom). Bound to the active slide's
 * `<media-controller>` via the `mediacontroller` attribute, which is swapped
 * on each slide activation. Returns the wrapper element plus the control bar
 * itself so callers can flip the binding.
 */
function createFloatingControls(): {
	bar: HTMLElement
	wrapper: HTMLElement
} {
	const wrapper = document.createElement('div')
	wrapper.className = 'pswp__floating-controls'
	// `data-unbound` drives opacity:0 (which can transition) so the bar
	// fades in when binding completes rather than popping in post-open.
	wrapper.dataset.unbound = ''

	const bar = document.createElement('media-control-bar')
	for (const tag of [
		'media-play-button',
		'media-mute-button',
		'media-volume-range',
		'media-time-range',
		'media-time-display',
	]) {
		bar.append(document.createElement(tag))
	}

	// Stop pointer events on the control bar from reaching PhotoSwipe's gesture
	// handler, so dragging the scrubber doesn't trigger a swipe/close.
	bar.addEventListener('pointerdown', (pointerEvent) => {
		pointerEvent.stopPropagation()
	})

	wrapper.append(bar)
	return { bar, wrapper }
}

/** Type guard for video slide data stored in content.data. */
function isVideoData(data: Record<string, unknown>): data is Record<string, unknown> & {
	videoConfig: string
	videoContainer: HTMLElement
	videoElement: VideoElementTag
	videoPoster: string
	videoSrc: string
} {
	return data.type === 'video' && data.videoContainer instanceof HTMLElement
}

/**
 * Query a video element (hls-video, youtube-video, vimeo-video) and return it
 * as HTMLMediaElement or null.
 */
function queryVideoElement(root: Element | null | undefined): HTMLMediaElement | null {
	const element = root?.querySelector(VIDEO_ELEMENT_SELECTOR)
	if (element instanceof HTMLMediaElement) return element
	// Custom video elements extend HTMLElement with play/pause/currentTime via
	// CustomVideoElement proxy — safe to treat as HTMLMediaElement.
	if (!element) return null // eslint-disable-line unicorn/no-null -- matching DOM API return type
	// eslint-disable-next-line ts/no-unsafe-type-assertion -- CustomVideoElement proxies HTMLMediaElement API
	return element as unknown as HTMLMediaElement
}

function createLightbox(options: LightboxOptions): PhotoSwipeLightbox {
	const lightbox = new PhotoSwipeLightbox({
		...options,
		pswpModule: async () => import('photoswipe'),
	})

	// Floating control bar, lazily mounted when PhotoSwipe's UI is ready. Lives
	// outside the slide zoom-wrap so it stays anchored to the viewport bottom
	// regardless of fit/fill/native zoom on the active video slide.
	let floatingControls: ReturnType<typeof createFloatingControls> | undefined
	let autohideTimerId: ReturnType<typeof globalThis.setTimeout> | undefined
	let pointerListenersCleanup: (() => void) | undefined

	// Autohide the floating bar based on pointer activity within the PhotoSwipe
	// root rather than the in-slide `<media-controller>`. The controller only
	// registers activity over the video itself — in fit mode, moving through
	// the letterbox gap would otherwise mark the user inactive before they
	// reach the bar. Tracking pointer activity on the whole viewport fixes it.
	const USER_INACTIVE_MS = 2000
	const markFloatingActive = (): void => {
		if (!floatingControls) return
		delete floatingControls.wrapper.dataset.userInactive
		if (autohideTimerId !== undefined) clearTimeout(autohideTimerId)
		autohideTimerId = globalThis.setTimeout(() => {
			if (floatingControls) floatingControls.wrapper.dataset.userInactive = ''
		}, USER_INACTIVE_MS)
	}

	const hideFloatingControls = (): void => {
		if (!floatingControls) return
		floatingControls.wrapper.dataset.unbound = ''
		floatingControls.bar.removeAttribute('mediacontroller')
		if (autohideTimerId !== undefined) {
			clearTimeout(autohideTimerId)
			autohideTimerId = undefined
		}
	}

	// --- Filters ---

	// Extract data from DOM elements. Also sets `showHideAnimationType` on the
	// lightbox options here (runs before PhotoSwipe is constructed) so the
	// opening animation matches the clicked item — text-link self-thumb slides
	// fade instead of zooming to/from the anchor's top-left corner.
	lightbox.addFilter('domItemData', (itemData: Record<string, unknown>, element: HTMLElement) => {
		const isSelfThumb = 'pswpSelfThumb' in element.dataset
		lightbox.options.showHideAnimationType = isSelfThumb ? 'fade' : 'zoom'

		if (element.dataset.pswpType === 'video') {
			const posterUrl = element.dataset.pswpPoster ?? ''
			return {
				...itemData,
				height: Number(element.dataset.pswpHeight) || 1080,
				msrc: posterUrl,
				type: 'video',
				videoConfig: element.dataset.pswpVideoConfig ?? '',
				videoContainer: element,
				// eslint-disable-next-line ts/no-unsafe-type-assertion -- value controlled by our own data attribute
				videoElement: (element.dataset.pswpVideoElement ?? 'hls-video') as VideoElementTag,
				videoPoster: posterUrl,
				videoSrc: element.dataset.pswpVideoSrc ?? '',
				width: Number(element.dataset.pswpWidth) || 1920,
			}
		}

		if (isSelfThumb) {
			return { ...itemData, selfThumbElement: element }
		}

		return itemData
	})

	// Enable placeholder for video — required for the zoom open/close animation.
	lightbox.addFilter(
		'useContentPlaceholder',
		(usePlaceholder: boolean, content: { data: Record<string, unknown> }) =>
			content.data.type === 'video' ? true : usePlaceholder,
	)

	// Mark video as zoomable so tap/double-tap triggers PhotoSwipe's secondary
	// zoom (and wheel-to-zoom). Default is false for non-image content.
	lightbox.addFilter(
		'isContentZoomable',
		(isZoomable: boolean, content: { data: Record<string, unknown> }) =>
			content.data.type === 'video' ? true : isZoomable,
	)

	// Use video container / anchor as the zoom animation origin.
	lightbox.addFilter(
		'thumbEl',
		(
			thumbElement: HTMLElement | null | undefined,
			itemData: Record<string, unknown>,
		): HTMLElement => {
			if (itemData.type === 'video' && itemData.videoContainer instanceof HTMLElement) {
				return itemData.videoContainer
			}

			if (itemData.selfThumbElement instanceof HTMLElement) {
				return itemData.selfThumbElement
			}

			return thumbElement ?? document.createElement('div')
		},
	)

	// Animate next/prev button clicks. PhotoSwipe's default next()/prev()
	// call goTo() which snaps instantly. Override to use the spring animation.
	// https://github.com/dimsemenov/PhotoSwipe/issues/1765#issuecomment-934010548
	lightbox.on('uiRegister', () => {
		const pswp = lightbox.pswp!
		pswp.next = () => {
			pswp.mainScroll.moveIndexBy(1, true)
		}

		pswp.prev = () => {
			pswp.mainScroll.moveIndexBy(-1, true)
		}

		// Mount floating control bar inside `pswp.scrollWrap` so it inherits
		// the same open/close transition as the slide content (and the native
		// top-bar buttons live as siblings here too).
		floatingControls = createFloatingControls()
		pswp.scrollWrap?.append(floatingControls.wrapper)

		// Track pointer activity across the entire PhotoSwipe root so the
		// floating bar stays visible when the pointer is over the backdrop /
		// letterbox gap between the video and the bottom-anchored bar.
		const root = pswp.element
		if (root) {
			root.addEventListener('pointermove', markFloatingActive)
			root.addEventListener('pointerdown', markFloatingActive)
			pointerListenersCleanup = (): void => {
				root.removeEventListener('pointermove', markFloatingActive)
				root.removeEventListener('pointerdown', markFloatingActive)
			}
		}
	})

	// Update `showHideAnimationType` when navigating between slides in a mixed
	// gallery so the close animation matches the current slide's type. Opening
	// is handled in the `domItemData` filter above (runs before pswp init).
	lightbox.on('change', () => {
		const { pswp } = lightbox
		if (!pswp?.currSlide) return
		const isSelfThumb = pswp.currSlide.data.selfThumbElement instanceof HTMLElement
		pswp.options.showHideAnimationType = isSelfThumb ? 'fade' : 'zoom'
	})

	// In fade mode, the backdrop fades in but the image otherwise snaps in.
	// Apply a CSS keyframe animation the moment the image is appended so it
	// fades in alongside the backdrop (not sequentially after load). Keyframe
	// animation plays reliably whether the image is cached or loads later.
	lightbox.on('contentAppend', (event) => {
		const { content } = event
		if (!(content.data.selfThumbElement instanceof HTMLElement)) return
		const image = content.element
		if (image instanceof HTMLImageElement) {
			image.classList.add('amk-fade-in')
		}
	})

	// --- Content lifecycle ---

	// Create a fresh video player in the lightbox.
	lightbox.on('contentLoad', (event) => {
		const { content } = event
		if (!isVideoData(content.data)) return
		event.preventDefault()

		const {
			videoConfig,
			videoContainer,
			videoElement: videoElementTag,
			videoPoster,
			videoSrc,
		} = content.data

		// Build the appropriate video element based on data-pswp-video-element.
		const videoElement = document.createElement(videoElementTag)
		videoElement.setAttribute('crossorigin', 'anonymous')
		videoElement.setAttribute('playsinline', 'true')
		videoElement.setAttribute('preload', 'metadata')
		if (videoPoster) videoElement.setAttribute('poster', videoPoster)

		// Apply hls.js config before setting src (HLS-specific).
		if (videoElementTag === 'hls-video' && videoConfig) {
			try {
				// eslint-disable-next-line ts/no-unsafe-assignment, ts/no-unsafe-type-assertion -- JSON.parse returns any; guarded by tag check above
				;(videoElement as unknown as HlsVideoElement).config = JSON.parse(videoConfig)
			} catch {
				console.warn('[astro-media-kit] Failed to parse HLS config:', videoConfig)
			}
		}

		videoElement.setAttribute('src', videoSrc)

		// Build <media-controller> with lightbox control style:
		// gesturesdisabled (no click-to-play), no fullscreen button.
		// Controls live outside the slide (see floatingControls), bound to this
		// controller's id via the `mediacontroller` attribute on activation.
		const controller = document.createElement('media-controller')
		controller.id = `amk-lightbox-mc-${controllerIdCounter++}`
		controller.setAttribute('gesturesdisabled', '')
		controller.classList.add('lightbox')
		videoElement.setAttribute('slot', 'media')
		controller.append(videoElement)

		// Wrapper element. PhotoSwipe's click handler keys off
		// `event.target.classList` — it fires `imageClickAction` only when the
		// target carries `pswp__img`. Paired with `pointer-events: none` on
		// the descendants (see Video.astro global styles), clicks fall through
		// to this wrapper, so the video behaves exactly like an image slide
		// (single-click zoom, zoom-in / grab cursors, etc.).
		const wrapper = document.createElement('div')
		wrapper.className = 'pswp__video-wrapper pswp__img'
		wrapper.append(controller)

		content.element = wrapper

		// Signal that custom content is ready. Without this, PhotoSwipe
		// keeps the content in LOADING state, which breaks slide transition
		// animations for the entire gallery.
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- onLoaded is a public method on Content, not in the types
		;(content as unknown as { onLoaded: () => void }).onLoaded()

		// Sync playback position from inline player (HLS only — embed
		// players don't expose currentTime reliably before playback).
		if (videoElementTag === 'hls-video') {
			const inlineVideo = queryVideoElement(videoContainer)
			if (inlineVideo && inlineVideo.currentTime > 0 && 'currentTime' in videoElement) {
				// eslint-disable-next-line ts/no-unsafe-type-assertion -- custom element (hls-video) exposes currentTime via CustomVideoElement proxy
				;(videoElement as unknown as HTMLMediaElement).currentTime = inlineVideo.currentTime
			}
		}
	})

	// Single source of truth: read `pswp.currSlide` and bind/hide the floating
	// bar accordingly. Called from events where `currSlide` is guaranteed
	// up-to-date:
	// - `change` — fires after mainScroll updates `currSlide` (on init after
	//   setContent, on pan after the new center slide is assigned). Note:
	//   `contentActivate` is NOT safe — it fires during `setIsActive()` in
	//   the mainScroll forEach loop, which runs *before* `currSlide` is
	//   updated (photoswipe.esm.js ~line 3045-3051).
	// - `appendHeavyContent` — fires in `slide.appendHeavy` *after*
	//   `content.append()` has attached `content.element` to the slide
	//   container. Needed for direct-entry: on first open, `change` fires
	//   during `init()` while `opener.isOpen` is still false, so
	//   `slide.appendHeavy()` bails out and `content.element` isn't in the
	//   DOM yet. The later `appendHeavyContent` (at `openingAnimationEnd`)
	//   completes the binding.
	const syncFloatingBar = (): void => {
		if (!floatingControls) return
		const content = lightbox.pswp?.currSlide?.content
		if (!content || !isVideoData(content.data)) {
			hideFloatingControls()
			return
		}

		const controller = content.element?.querySelector('media-controller')
		if (!(controller instanceof HTMLElement) || !controller.isConnected) {
			// Content not attached yet — will retry on appendHeavyContent.
			return
		}

		floatingControls.bar.setAttribute('mediacontroller', controller.id)
		delete floatingControls.wrapper.dataset.unbound
		markFloatingActive()
	}

	lightbox.on('change', syncFloatingBar)
	lightbox.on('appendHeavyContent', syncFloatingBar)

	// Auto-play on activate, pause on deactivate. Separate from the bar
	// binding above — this is purely video lifecycle.
	lightbox.on('contentActivate', ({ content }) => {
		if (!isVideoData(content.data)) return
		const video = queryVideoElement(content.element)
		if (video) {
			void video.play()
		}

		// Pause the inline player.
		const inlineVideo = queryVideoElement(content.data.videoContainer)
		if (inlineVideo && !inlineVideo.paused) {
			inlineVideo.pause()
		}
	})

	lightbox.on('contentDeactivate', ({ content }) => {
		if (!isVideoData(content.data)) return
		const video = queryVideoElement(content.element)
		if (video && !video.paused) {
			video.pause()
		}
	})

	// Sync position back to inline player and clean up lightbox player.
	lightbox.on('contentDestroy', ({ content }) => {
		if (!isVideoData(content.data)) return
		syncBackToInline(content)
	})

	lightbox.on('destroy', () => {
		const { pswp } = lightbox
		if (!pswp) return
		const content = pswp.currSlide?.content
		if (content && isVideoData(content.data)) {
			syncBackToInline(content)
		}

		hideFloatingControls()
		pointerListenersCleanup?.()
		pointerListenersCleanup = undefined
		floatingControls?.wrapper.remove()
		floatingControls = undefined
	})

	// Caption plugin: extract caption from the <figcaption> sibling of the
	// .pswp-zoom element inside the <figure> wrapper rendered by Caption.astro.
	// eslint-disable-next-line ts/no-unsafe-assignment, ts/no-unsafe-call -- plugin has no type declarations
	const captionPlugin = new PhotoSwipeDynamicCaption(lightbox, {
		captionContent(slide: { data: { element?: HTMLElement } }) {
			const { element } = slide.data
			const figure = element?.closest('figure')
			const figcaption = figure?.querySelector('figcaption')
			return figcaption?.innerHTML ?? false
		},
		type: 'below',
	})

	// Guard against plugin crash when pswp.currSlide is undefined during
	// the initial 'change' event in pswp.init(). The plugin calls
	// showCaption(pswp.currSlide) without checking for undefined.
	// eslint-disable-next-line ts/no-unsafe-type-assertion -- plugin instance type not exported
	const plugin = captionPlugin as unknown as {
		showCaption: (slide: unknown) => void
	}
	const originalShowCaption = plugin.showCaption.bind(plugin)
	plugin.showCaption = (slide: unknown) => {
		if (!slide) return
		originalShowCaption(slide)
	}

	lightbox.init()
	return lightbox
}

/**
 * Sync the lightbox player's position back to the inline player.
 */
function syncBackToInline(content: {
	data: Record<string, unknown>
	element?: HTMLElement | undefined
}): void {
	if (!isVideoData(content.data)) return
	// Only sync for HLS — embed players handle their own state.
	if (content.data.videoElement !== 'hls-video') return
	const lightboxVideo = queryVideoElement(content.element)
	const inlineVideo = queryVideoElement(content.data.videoContainer)

	if (lightboxVideo && inlineVideo && lightboxVideo.currentTime > 0) {
		inlineVideo.currentTime = lightboxVideo.currentTime
	}
}

// --- Initialize lightboxes ---

// Resolve scoped galleries before collecting gallery names.
resolveScopedGalleries()

// Standalone items (zoom={true}, no gallery grouping).
const standaloneLightbox = createLightbox({
	gallery: '.pswp-zoom:not([data-pswp-gallery])',
	secondaryZoomLevel,
	zoom: false,
})

// Grouped galleries — one lightbox per unique gallery name.
const galleryNames = new Set(
	Array.from(
		document.querySelectorAll<HTMLElement>('.pswp-zoom[data-pswp-gallery]'),
		(element) => element.dataset.pswpGallery!,
	),
)

const galleryLightboxes = new Map<string, PhotoSwipeLightbox>()

for (const name of galleryNames) {
	const lb = createLightbox({
		bgOpacity: 0.9,
		children: `.pswp-zoom[data-pswp-gallery="${name}"]`,
		counter: false,
		gallery: 'body',
		initialZoomLevel: 'fit',
		loop: false,
		secondaryZoomLevel,
		zoom: false,
	})
	galleryLightboxes.set(name, lb)
}

// Keep clicks on inline media controls (play/pause/time/mute/etc.) from
// bubbling to PhotoSwipe's gallery click handler — they should operate the
// player without opening the lightbox. Clicks on the video area itself bubble
// and open the lightbox, matching how images behave.
for (const container of document.querySelectorAll<HTMLElement>(
	'.pswp-zoom[data-pswp-type="video"]',
)) {
	container.addEventListener('click', (event) => {
		if (
			event.target instanceof Element &&
			event.target.closest('media-control-bar, [slot="centered-chrome"]')
		) {
			event.stopPropagation()
		}
	})
}

// Video trigger buttons: open the lightbox programmatically.
for (const trigger of document.querySelectorAll<HTMLButtonElement>('.pswp-video-trigger')) {
	trigger.addEventListener('click', (event) => {
		event.stopPropagation()
		const container = trigger.closest<HTMLElement>('.pswp-zoom')
		if (!container) return

		const galleryName = container.dataset.pswpGallery

		if (galleryName) {
			const lb = galleryLightboxes.get(galleryName)
			if (!lb) return
			const children = [
				...document.querySelectorAll<HTMLElement>(`.pswp-zoom[data-pswp-gallery="${galleryName}"]`),
			]
			const index = children.indexOf(container)
			if (index !== -1) {
				lb.loadAndOpen(index)
			}
		} else {
			// Standalone: each .pswp-zoom is its own 1-item gallery.
			// Open at index 0 with this specific element as the data source.
			standaloneLightbox.loadAndOpen(0, { gallery: container })
		}
	})
}
