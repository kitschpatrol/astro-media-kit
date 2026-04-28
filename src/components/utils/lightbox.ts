/* eslint-disable ts/no-unnecessary-condition */
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
 * Lock page scroll while the lightbox is open.
 *
 * When true, adds `amk-lock-scroll` to `<html>` on open and writes the measured
 * scrollbar width to `--amk-scrollbar-width`. Zoomer.astro's global stylesheet
 * applies `overflow: hidden` and a compensating `padding-right` — scrollbar
 * disappears, no layout shift, and the (position: fixed) lightbox spans the
 * full viewport width.
 *
 * Flip to false to leave page scroll untouched.
 */
const LOCK_PAGE_SCROLL = false

/**
 * Enable the horizontal swipe/drag navigation gesture on single-item
 * lightboxes.
 *
 * PhotoSwipe's drag handler shifts the main scroll on horizontal drag
 * regardless of item count, producing a rubber-band bounce when there is
 * nothing to navigate to. On multi-item galleries this is useful swipe
 * navigation; on single-item lightboxes it's visually noisy for no functional
 * gain.
 *
 * When false (default), single-item lightboxes intercept drag-originated
 * main-scroll moves. Other gestures (pinch-zoom, zoomed pan, vertical
 * drag-to-close, tap) are unaffected. Multi-item galleries always allow swipe
 * navigation regardless of this flag.
 */
const ENABLE_SWIPE_GESTURE_ON_SINGLE_ITEM_LIGHTBOXES = false

/**
 * Per-item secondary zoom level. Reads `data-pswp-level` from the triggering
 * element — `'native'` zooms to 1:1 pixels, `'fill'` zooms to cover the
 * viewport, anything else (including absent) keeps the fitted view.
 */
const secondaryZoomLevel: LightboxOptions['secondaryZoomLevel'] = (zoomLevelObject) => {
	const { element } = zoomLevelObject.itemData
	if (element instanceof HTMLElement) {
		if (element.dataset.pswpLevel === 'native') {
			return 1
		}

		if (element.dataset.pswpLevel === 'fill') {
			return zoomLevelObject.fill
		}
	}

	return zoomLevelObject.fit
}

/** Supported video element tag names for lightbox playback. */
type VideoElementTag = 'hls-video' | 'video' | 'vimeo-video' | 'youtube-video'

const VIDEO_ELEMENT_SELECTOR = 'video, hls-video, youtube-video, vimeo-video'

/**
 * Shape of a `<media-controller>` instance including the runtime-only
 * association methods that media-chrome exposes but doesn't declare in its
 * public types.
 */
type MediaChromeHost = HTMLElement & {
	associateElement(element: Element): void
	unassociateElement(element: Element): void
}

/**
 * Monotonic counter for unique media-controller ids across all lightbox
 * instances.
 */
let controllerIdCounter = 0

/**
 * Tracks whether the lightbox player was playing at the moment it was
 * deactivated, keyed by the inline player's container element. Read during
 * `syncBackToInline` to decide whether to resume the inline player on close —
 * `contentDeactivate` pauses the lightbox video before `contentDestroy` fires,
 * so the paused/playing signal has to be captured earlier and stashed here.
 * WeakMap so entries drop when the container element goes away.
 */
const wasPlayingMap = new WeakMap<HTMLElement, boolean>()

/**
 * Build a floating control bar to be appended outside the PhotoSwipe zoom
 * transform (anchored to the viewport bottom). Bound to the active slide's
 * `<media-controller>` via the `mediacontroller` attribute, which is swapped on
 * each slide activation. Returns the wrapper element plus the control bar
 * itself so callers can flip the binding.
 */
function createFloatingControls(): {
	bar: HTMLElement
	wrapper: HTMLElement
} {
	const wrapper = document.createElement('div')
	// `pswp__hide-on-close` wires the bar into PhotoSwipe's open/close
	// opacity transition (driven by the `.pswp--ui-visible` class on the
	// root), matching the fade-out behavior of the native close/arrow
	// buttons. `data-unbound` drives opacity:0 while no video is bound;
	// the rule in Video.astro repeats the class to reach specificity
	// (0,3,0) so it beats `.pswp--ui-visible .pswp__hide-on-close`'s
	// opacity:1 regardless of stylesheet source order.
	wrapper.className = 'pswp__floating-controls pswp__hide-on-close'
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
	if (element instanceof HTMLMediaElement) {
		return element
	}

	// Custom video elements extend HTMLElement with play/pause/currentTime via
	// CustomVideoElement proxy — safe to treat as HTMLMediaElement.
	if (!element) {
		return null // eslint-disable-line unicorn/no-null -- matching DOM API return type
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion -- CustomVideoElement proxies HTMLMediaElement API
	return element as unknown as HTMLMediaElement
}

/**
 * Tear down the hls.js instance attached to an `<hls-video>` element.
 * `hls-video-element` does not destroy its `Hls` worker in
 * `disconnectedCallback` (see hls-video-element.js — only `load()` calls
 * `#destroy`), so when PhotoSwipe removes lightbox content the HLS worker keeps
 * running and its segment fetches keep using bandwidth. Across repeat opens
 * this compounds into a visible delay before the next video can start playing.
 */
function destroyHlsInstance(element: Element | null | undefined): void {
	if (element?.tagName.toLowerCase() !== 'hls-video') {
		return
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion -- `api` is a public (non-#) field on hls-video-element
	const hlsHost = element as unknown as {
		api?: null | { destroy(): void; detachMedia(): void }
	}
	if (!hlsHost.api) {
		return
	}

	try {
		hlsHost.api.detachMedia()
		hlsHost.api.destroy()
	} catch (error) {
		console.warn('[astro-media-kit] Failed to destroy HLS instance:', error)
	}

	hlsHost.api = null // eslint-disable-line unicorn/no-null -- matches hls-video-element's own teardown
}

/**
 * Kick off playback. Safe to call multiple times — `play()` is idempotent on an
 * already-playing element. Surfaces rejection reasons (autoplay blocked,
 * network error) instead of swallowing them.
 */
function tryPlay(video: HTMLMediaElement): void {
	video.play().catch((error: unknown) => {
		console.warn('[astro-media-kit] Lightbox video play() rejected:', error)
	})
}

function createLightbox(
	options: LightboxOptions,
	{ singleItem = false }: { singleItem?: boolean } = {},
): PhotoSwipeLightbox {
	const lightbox = new PhotoSwipeLightbox({
		...options,
		pswpModule: async () => import('photoswipe'),
	})

	// Disable drag-to-navigate on single-item lightboxes by wrapping
	// `mainScroll.moveTo` so drag-originated calls (second arg truthy) become
	// no-ops. Non-drag calls — initial positioning, programmatic slide
	// changes, and open/close animations — pass through unchanged. Hooked on
	// `bindEvents` because `pswp.mainScroll` is instantiated during init by
	// that point.
	if (singleItem && !ENABLE_SWIPE_GESTURE_ON_SINGLE_ITEM_LIGHTBOXES) {
		lightbox.on('bindEvents', () => {
			const { pswp } = lightbox
			if (!pswp?.mainScroll) {
				return
			}

			const originalMoveTo = pswp.mainScroll.moveTo.bind(pswp.mainScroll)
			pswp.mainScroll.moveTo = (x: number, dragging?: boolean): void => {
				if (dragging) {
					return
				}

				originalMoveTo(x, dragging)
			}
		})
	}

	// Floating control bar, lazily mounted when PhotoSwipe's UI is ready. Lives
	// outside the slide zoom-wrap so it stays anchored to the viewport bottom
	// regardless of fit/fill/native zoom on the active video slide.
	let floatingControls: ReturnType<typeof createFloatingControls> | undefined
	let autohideTimerId: ReturnType<typeof globalThis.setTimeout> | undefined
	let pointerListenersCleanup: (() => void) | undefined
	let keyboardListenerCleanup: (() => void) | undefined
	// Currently-bound controller for the floating bar. Tracked so we can
	// `unassociateElement` on slide change / close.
	let boundController: HTMLElement | undefined
	// Autohide the floating bar based on pointer activity within the PhotoSwipe
	// root rather than the in-slide `<media-controller>`. The controller only
	// registers activity over the video itself — in fit mode, moving through
	// the letterbox gap would otherwise mark the user inactive before they
	// reach the bar. Tracking pointer activity on the whole viewport fixes it.
	const USER_INACTIVE_MS = 2000
	const markFloatingActive = (): void => {
		if (!floatingControls) {
			return
		}

		delete floatingControls.wrapper.dataset.userInactive
		if (autohideTimerId !== undefined) {
			clearTimeout(autohideTimerId)
		}

		autohideTimerId = globalThis.setTimeout(() => {
			if (floatingControls) {
				floatingControls.wrapper.dataset.userInactive = ''
			}
		}, USER_INACTIVE_MS)
	}

	const hideFloatingControls = (): void => {
		if (!floatingControls) {
			return
		}

		floatingControls.wrapper.dataset.unbound = ''
		floatingControls.bar.removeAttribute('mediacontroller')

		if (boundController) {
			// eslint-disable-next-line ts/no-unsafe-type-assertion -- media-chrome method not in public types
			;(boundController as MediaChromeHost).unassociateElement(floatingControls.bar)
			boundController = undefined
		}

		if (autohideTimerId !== undefined) {
			clearTimeout(autohideTimerId)
			autohideTimerId = undefined
		}
	}

	/**
	 * Bind the floating bar to a controller by calling `associateElement`
	 * directly. `<media-control-bar>` only exposes the `mediacontroller`
	 * attribute (no JS property setter), and that attribute path requires the bar
	 * to be connected and the controller to be findable via
	 * `getRootNode().getElementById()`. Calling `associateElement` directly
	 * sidesteps that lookup.
	 *
	 * Callers must ensure the controller is already attached to the DOM — see
	 * `syncFloatingBar`. An attached controller has its `mediaStore` already
	 * initialized (media-controller.js creates it in `connectedCallback`), so
	 * `associateElement` propagates current state synchronously. The bar then
	 * renders with correct initial state (e.g. the play icon, since the video is
	 * paused before playback starts) — no visible flash of default slotted
	 * content.
	 */
	const bindFloatingBar = (controller: HTMLElement): void => {
		if (!floatingControls) {
			return
		}

		if (boundController !== controller) {
			if (boundController) {
				// eslint-disable-next-line ts/no-unsafe-type-assertion -- media-chrome method not in public types
				;(boundController as MediaChromeHost).unassociateElement(floatingControls.bar)
			}

			// eslint-disable-next-line ts/no-unsafe-type-assertion -- media-chrome method not in public types
			;(controller as MediaChromeHost).associateElement(floatingControls.bar)
			boundController = controller
		}

		floatingControls.bar.removeAttribute('mediacontroller')
		delete floatingControls.wrapper.dataset.unbound
		markFloatingActive()
	}

	// --- Page scroll lock ---

	// Measured per-open because devicePixelRatio / browser zoom can change
	// scrollbar width at runtime. Gated by LOCK_PAGE_SCROLL above.
	lightbox.on('beforeOpen', () => {
		if (!LOCK_PAGE_SCROLL) {
			return
		}

		const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
		document.documentElement.style.setProperty('--amk-scrollbar-width', `${scrollbarWidth}px`)
		document.documentElement.classList.add('amk-lock-scroll')
	})

	// Tag the slide's holder element for video-slide-specific CSS before the
	// caption plugin measures the caption. Hooked to `calcSlideSize` (not
	// `slideInit`) because `slide.holderElement` is still null in the Slide
	// constructor — it's only assigned in `slide.append()` right before
	// `calcSlideSize` dispatches. Our listener is registered before the
	// caption plugin is constructed, so in event-emitter order we run first
	// and the plugin's `getBoundingClientRect()` sees a caption that already
	// has the video-specific `padding-bottom` applied.
	//
	// Uses `classList.toggle` rather than `.add` because PhotoSwipe recycles
	// only three `itemHolder` elements (prev/curr/next) across the whole
	// gallery — when a holder that previously rendered a video slide gets
	// reassigned to an image slide during a swipe, `calcSlideSize` fires
	// again for the new slide and this sync clears the stale class. Without
	// the toggle, mixed galleries leave the video padding stuck on the
	// wrong slides.
	lightbox.on('calcSlideSize', ({ slide }) => {
		if (!slide.holderElement) {
			return
		}

		slide.holderElement.classList.toggle('pswp__item--video', slide.data.type === 'video')
	})

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
				videoElement: element.dataset.pswpVideoElement ?? 'hls-video',
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

		// Space key toggles play/pause on the active video slide, and is
		// swallowed on any slide so it doesn't scroll the page behind the
		// lightbox. Attached to the document while the lightbox is open
		// (uiRegister → destroy).
		const handleKeydown = (event: KeyboardEvent): void => {
			if (event.code !== 'Space' && event.key !== ' ') {
				return
			}

			const { target } = event
			if (
				target instanceof HTMLElement &&
				(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
			) {
				return
			}

			event.preventDefault()
			const content = lightbox.pswp?.currSlide?.content
			if (!content || !isVideoData(content.data)) {
				return
			}

			const video = queryVideoElement(content.element)
			if (!video) {
				return
			}

			markFloatingActive()
			if (video.paused) {
				tryPlay(video)
			} else {
				video.pause()
			}
		}

		document.addEventListener('keydown', handleKeydown)
		keyboardListenerCleanup = (): void => {
			document.removeEventListener('keydown', handleKeydown)
		}
	})

	// Track opening/closing zoom animations so the floating bar can suppress
	// hover backgrounds while its wrapper opacity is animating. Each
	// media-chrome control's shadow DOM composites its own translucent layer;
	// stacking them mid-fade causes a black-rect artifact. `pswp--ui-visible`
	// can't be used here — PhotoSwipe adds it at the *start* of the opening
	// animation (it's the class that drives the pswp__hide-on-close fade), so
	// it's on throughout the transition.
	lightbox.on('openingAnimationStart', () => {
		if (floatingControls) {
			floatingControls.wrapper.dataset.transitioning = ''
		}
	})
	lightbox.on('openingAnimationEnd', () => {
		if (floatingControls) {
			delete floatingControls.wrapper.dataset.transitioning
		}
	})
	lightbox.on('closingAnimationStart', () => {
		if (floatingControls) {
			floatingControls.wrapper.dataset.transitioning = ''
		}

		// Release page scroll lock at the START of the close animation rather
		// than at destroy. System scrollbars can't be CSS-transitioned, so
		// instead we hand them back while the lightbox is still fading on top
		// — the closing opacity masks the scrollbar's reappearance. The
		// (position: fixed) backdrop loses ~scrollbar-width on its right edge
		// for the duration of the animation; usually invisible against a
		// fading overlay. Cleanup still runs in `destroy` as a fallback.
		document.documentElement.classList.remove('amk-lock-scroll')
		document.documentElement.style.removeProperty('--amk-scrollbar-width')
	})

	// Update `showHideAnimationType` when navigating between slides in a mixed
	// gallery so the close animation matches the current slide's type. Opening
	// is handled in the `domItemData` filter above (runs before pswp init).
	lightbox.on('change', () => {
		const { pswp } = lightbox
		if (!pswp?.currSlide) {
			return
		}

		const isSelfThumb = pswp.currSlide.data.selfThumbElement instanceof HTMLElement
		pswp.options.showHideAnimationType = isSelfThumb ? 'fade' : 'zoom'
	})

	// In fade mode, the backdrop fades in but the image otherwise snaps in.
	// Apply a CSS keyframe animation the moment the image is appended so it
	// fades in alongside the backdrop (not sequentially after load). Keyframe
	// animation plays reliably whether the image is cached or loads later.
	lightbox.on('contentAppend', (event) => {
		const { content } = event
		if (!(content.data.selfThumbElement instanceof HTMLElement)) {
			return
		}

		const image = content.element
		if (image instanceof HTMLImageElement) {
			image.classList.add('amk-fade-in')
		}
	})

	// --- Content lifecycle ---

	// Create a fresh video player in the lightbox.
	lightbox.on('contentLoad', (event) => {
		const { content } = event
		if (!isVideoData(content.data)) {
			return
		}

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
		videoElement.setAttribute('preload', 'auto')
		// Start muted so browser autoplay policies allow immediate playback
		// when the lightbox opens. Without this, `video.play()` in
		// `contentActivate` silently rejects on first open (no user gesture
		// yet on the lightbox video itself) and the floating bar — bound to
		// a paused video — shows the play icon for seconds before anything
		// happens. The inline player is muted by default too, and the user
		// can unmute via the floating control bar.
		videoElement.setAttribute('muted', '')
		if (videoPoster) {
			videoElement.setAttribute('poster', videoPoster)
		}

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

		// Binding happens later via `syncFloatingBar` on `appendHeavyContent`
		// — only once the controller is actually connected to the DOM.
		// Binding here would call `associateElement` on a detached controller,
		// which silently propagates no state (mediaStore isn't created until
		// `connectedCallback`), leaving the bar's receivers with default
		// slotted content that briefly flashes once state finally arrives.

		// Sync playback position from the inline player. For hls-video the
		// eager set lands on the custom element's internal buffer and is
		// applied once the MediaSource is attached. For embed elements
		// (vimeo-video-element / youtube-video-element) the setter stores the
		// value and replays it after `loadComplete` resolves, but that promise
		// only resolves after the iframe API fires `loadcomplete` — so add a
		// one-shot event listener as a belt-and-braces fallback in case the
		// eager set races the element's internal `#currentTime` initialization.
		const inlineVideo = queryVideoElement(videoContainer)
		const inlineCurrentTime = inlineVideo?.currentTime ?? 0
		if (inlineCurrentTime > 0) {
			// eslint-disable-next-line ts/no-unsafe-type-assertion -- all supported video elements expose currentTime via CustomVideoElement proxy
			const proxiedVideo = videoElement as unknown as HTMLMediaElement
			proxiedVideo.currentTime = inlineCurrentTime
			const applySeek = (): void => {
				proxiedVideo.currentTime = inlineCurrentTime
			}

			// `loadcomplete` is dispatched by vimeo-video-element /
			// youtube-video-element once the iframe API is ready.
			// `loadedmetadata` covers the native-video path (hls-video).
			videoElement.addEventListener('loadcomplete', applySeek, { once: true })
			videoElement.addEventListener('loadedmetadata', applySeek, { once: true })
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
	//
	// We only bind once the controller is connected to the DOM. A detached
	// controller's `mediaStore` doesn't exist yet (only created in
	// `connectedCallback`) so `associateElement` propagates zero state,
	// which leaves receiver attributes unset and causes a visible flash of
	// default slotted content once state finally arrives.
	const syncFloatingBar = (): void => {
		if (!floatingControls) {
			return
		}

		const content = lightbox.pswp?.currSlide?.content
		if (!content || !isVideoData(content.data)) {
			hideFloatingControls()
			return
		}

		const controller = content.element?.querySelector('media-controller')
		if (!(controller instanceof HTMLElement) || !controller.isConnected) {
			return
		}

		bindFloatingBar(controller)
	}

	lightbox.on('change', syncFloatingBar)
	lightbox.on('appendHeavyContent', syncFloatingBar)

	// Auto-play on activate, pause on deactivate. Separate from the bar
	// binding above — this is purely video lifecycle. On first open,
	// `contentActivate` fires BEFORE the content wrapper is attached to the
	// slide (attachment happens in `appendHeavyContent` at
	// `openingAnimationEnd`). hls-video-element doesn't start HLS loading
	// until the element is connected, so calling `play()` here has no
	// effect on first-open. The `appendHeavyContent` handler below re-runs
	// `tryPlay` once the element is in the DOM.
	lightbox.on('contentActivate', ({ content }) => {
		if (!isVideoData(content.data)) {
			return
		}

		const video = queryVideoElement(content.element)
		if (video) {
			tryPlay(video)
		}

		// Pause the inline player.
		const inlineVideo = queryVideoElement(content.data.videoContainer)
		if (inlineVideo && !inlineVideo.paused) {
			inlineVideo.pause()
		}
	})

	// Start playback once the video element is actually in the DOM. This is
	// the critical autoplay moment on first open — before this, the
	// hls-video-element hasn't initialized hls.js (it waits for
	// `connectedCallback` / src attribute processing once connected).
	lightbox.on('appendHeavyContent', ({ slide }) => {
		const { content } = slide
		if (!content || !isVideoData(content.data)) {
			return
		}

		const video = queryVideoElement(content.element)
		if (video?.paused) {
			tryPlay(video)
		}
	})

	lightbox.on('contentDeactivate', ({ content }) => {
		if (!isVideoData(content.data)) {
			return
		}

		const video = queryVideoElement(content.element)
		if (!video) {
			return
		}

		// Record play state *before* pausing so `syncBackToInline` can restore
		// it on the inline player when the lightbox closes. Also fires on slide
		// changes in multi-item galleries — harmless, the entry is overwritten
		// the next time the slide activates and deactivates, and it's only
		// read from the close path.
		const wasPlaying = !video.paused
		wasPlayingMap.set(content.data.videoContainer, wasPlaying)
		if (wasPlaying) {
			video.pause()
		}
	})

	// Sync position back to inline player and tear down the lightbox video.
	// Destroying the hls.js instance here is critical — without it, every
	// closed slide leaves a live HLS worker fetching segments in the
	// background, compounding latency and delaying subsequent opens by
	// seconds.
	lightbox.on('contentDestroy', ({ content }) => {
		if (!isVideoData(content.data)) {
			return
		}

		syncBackToInline(content)
		destroyHlsInstance(content.element?.querySelector(VIDEO_ELEMENT_SELECTOR))
	})

	lightbox.on('destroy', () => {
		// Do NOT guard on `lightbox.pswp` here. PhotoSwipe may null `pswp`
		// before dispatching `destroy`, and an early-return in that branch
		// would skip cleanup — leaking `boundController`, the pointer
		// listeners, and the `floatingControls` DOM node.
		const content = lightbox.pswp?.currSlide?.content
		if (content && isVideoData(content.data)) {
			syncBackToInline(content)
			destroyHlsInstance(content.element?.querySelector(VIDEO_ELEMENT_SELECTOR))
		}

		hideFloatingControls()
		pointerListenersCleanup?.()
		pointerListenersCleanup = undefined
		keyboardListenerCleanup?.()
		keyboardListenerCleanup = undefined
		floatingControls?.wrapper.remove()
		floatingControls = undefined

		// Release page scroll lock. Safe to run unconditionally — no-op when
		// the class/variable aren't set (LOCK_PAGE_SCROLL was false).
		document.documentElement.classList.remove('amk-lock-scroll')
		document.documentElement.style.removeProperty('--amk-scrollbar-width')
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
		if (!slide) {
			return
		}

		originalShowCaption(slide)
	}

	lightbox.init()
	return lightbox
}

/**
 * Sync the lightbox player's position and play state back to the inline player,
 * so closing the lightbox is transparent — same currentTime, same
 * playing/paused status. Works for all video element types: hls-video reads
 * currentTime off its native `<video>` and embed elements (vimeo-video-element
 * / youtube-video-element) expose the last-known time cached from their
 * `timeupdate` handlers, so the synchronous getter is non-blocking in every
 * case.
 */
function syncBackToInline(content: {
	data: Record<string, unknown>
	element?: HTMLElement | undefined
}): void {
	if (!isVideoData(content.data)) {
		return
	}

	const lightboxVideo = queryVideoElement(content.element)
	const inlineVideo = queryVideoElement(content.data.videoContainer)
	if (!inlineVideo) {
		return
	}

	if (lightboxVideo && lightboxVideo.currentTime > 0) {
		inlineVideo.currentTime = lightboxVideo.currentTime
	}

	// Resume inline playback if the lightbox video was playing when it was
	// deactivated. `wasPlayingMap` is populated in `contentDeactivate` (before
	// the pause) because by the time we get here the lightbox video is
	// already paused, so `lightboxVideo.paused` can't be inspected directly.
	if (wasPlayingMap.get(content.data.videoContainer)) {
		tryPlay(inlineVideo)
	}

	wasPlayingMap.delete(content.data.videoContainer)
}

// --- Initialize lightboxes ---

// Resolve scoped galleries before collecting gallery names.
resolveScopedGalleries()

// Standalone items (zoom={true}, no gallery grouping). Each open passes the
// clicked element as a single-item gallery via `loadAndOpen(0, { gallery })`,
// so this lightbox is always single-item.
const standaloneLightbox = createLightbox(
	{
		gallery: '.pswp-zoom:not([data-pswp-gallery])',
		secondaryZoomLevel,
		zoom: false,
	},
	{ singleItem: true },
)

// Grouped galleries — one lightbox per unique gallery name.
const galleryNames = new Set(
	Array.from(
		document.querySelectorAll<HTMLElement>('.pswp-zoom[data-pswp-gallery]'),
		(element) => element.dataset.pswpGallery!,
	),
)

const galleryLightboxes = new Map<string, PhotoSwipeLightbox>()

for (const name of galleryNames) {
	const itemCount = document.querySelectorAll(`.pswp-zoom[data-pswp-gallery="${name}"]`).length
	const lb = createLightbox(
		{
			bgOpacity: 0.9,
			children: `.pswp-zoom[data-pswp-gallery="${name}"]`,
			counter: false,
			gallery: 'body',
			initialZoomLevel: 'fit',
			loop: false,
			secondaryZoomLevel,
			zoom: false,
		},
		{ singleItem: itemCount === 1 },
	)
	galleryLightboxes.set(name, lb)
}

// Keep clicks on inline media controls (play/pause/time/mute/etc.) from
// reaching PhotoSwipe's gallery click handler — they should operate the
// player without opening the lightbox. Clicks on the video area itself bubble
// and open the lightbox, matching how images behave.
//
// The listener is attached to the control elements themselves, not to the
// `.pswp-zoom` container. PhotoSwipe binds its own click handler to each
// gallery node during `init()` (see photoswipe/lightbox.js `_bindEvents`),
// and `stopPropagation` on a sibling listener attached to the same node
// can't stop PhotoSwipe's handler — that would require
// `stopImmediatePropagation` plus guaranteed earlier registration. Stopping
// propagation from a descendant instead means the click never reaches the
// `.pswp-zoom` node, so neither our handler nor PhotoSwipe's runs there.
// The `.pswp-video-trigger` (fullscreen) button has its own click listener
// that stops propagation and opens the lightbox programmatically, so it
// continues to work unchanged.
for (const container of document.querySelectorAll<HTMLElement>(
	'.pswp-zoom[data-pswp-type="video"]',
)) {
	for (const control of container.querySelectorAll<HTMLElement>(
		'media-control-bar, [slot="centered-chrome"]',
	)) {
		control.addEventListener('click', (event) => {
			event.stopPropagation()
		})
	}
}

// Video trigger buttons: open the lightbox programmatically.
for (const trigger of document.querySelectorAll<HTMLButtonElement>('.pswp-video-trigger')) {
	trigger.addEventListener('click', (event) => {
		event.stopPropagation()
		const container = trigger.closest<HTMLElement>('.pswp-zoom')
		if (!container) {
			return
		}

		const galleryName = container.dataset.pswpGallery

		if (galleryName) {
			const lb = galleryLightboxes.get(galleryName)
			if (!lb) {
				return
			}

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
