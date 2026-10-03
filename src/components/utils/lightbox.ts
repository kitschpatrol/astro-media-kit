/* eslint-disable ts/no-unnecessary-condition */
/* eslint-disable ts/no-restricted-types */
/**
 * Shared PhotoSwipe lightbox initialization for both image (Zoomer) and video
 * (Video) components. Supports mixed galleries containing both content types.
 *
 * Images use the default PhotoSwipe image type. Videos use a custom 'video'
 * type — a duplicate Video.js player is created in the lightbox (the inline
 * player stays on the page, consistent with how images work). Playback position
 * is synced: the lightbox player seeks to the inline player's current time on
 * open, and the inline player syncs back on close.
 */

import type { HlsJsVideoElement, HlsSource } from '@videojs/html/media/hlsjs-video'
// @ts-expect-error — no type declarations available for this package
import PhotoSwipeDynamicCaption from 'photoswipe-dynamic-caption-plugin'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import '../internal/videojs-ui'
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

/** Supported media element tag names for lightbox playback. */
type VideoElementTag = 'hlsjs-video' | 'video' | 'vimeo-video' | 'youtube-video'

const VIDEO_ELEMENT_TAGS = new Set<string>(['hlsjs-video', 'video', 'vimeo-video', 'youtube-video'])
const VIDEO_ELEMENT_SELECTOR = [...VIDEO_ELEMENT_TAGS].join(', ')

function parseVideoElementTag(value: string | undefined): undefined | VideoElementTag {
	return value !== undefined && VIDEO_ELEMENT_TAGS.has(value)
		? (value as VideoElementTag)
		: undefined
}

/** The Popover API, which older browsers lack. */
type PopoverCapable = Partial<Pick<HTMLElement, 'hidePopover' | 'showPopover'>>

/** Milliseconds of pointer inactivity before the floating bar fades out. */
const USER_INACTIVE_MS = 2000

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
 * Floating control bar markup. Static, so it is safe to assign as HTML. The
 * classes match VideoPlayer.astro's inline bar so amk-video.css styles both.
 */
const FLOATING_CONTROLS_HTML = `
<media-controls visibility="always">
	<media-controls-content class="amk-controls">
		<media-controls-group class="amk-bar" aria-label="Playback controls">
			<media-play-button class="amk-button">
				<media-icon class="amk-icon-play" name="play"></media-icon>
				<media-icon class="amk-icon-pause" name="pause"></media-icon>
				<media-icon class="amk-icon-restart" name="restart"></media-icon>
			</media-play-button>
			<media-mute-button class="amk-button">
				<media-icon class="amk-icon-volume-off" name="volume-off"></media-icon>
				<media-icon class="amk-icon-volume-low" name="volume-low"></media-icon>
				<media-icon class="amk-icon-volume-high" name="volume-high"></media-icon>
			</media-mute-button>
			<media-volume-slider class="amk-slider amk-volume-slider">
				<media-slider-track class="amk-slider-track">
					<media-slider-fill class="amk-slider-fill"></media-slider-fill>
				</media-slider-track>
				<media-slider-thumb class="amk-slider-thumb"></media-slider-thumb>
			</media-volume-slider>
			<media-time-slider class="amk-slider amk-time-slider">
				<media-slider-track class="amk-slider-track">
					<media-slider-buffer class="amk-slider-buffer"></media-slider-buffer>
					<media-slider-fill class="amk-slider-fill"></media-slider-fill>
				</media-slider-track>
				<media-slider-thumb class="amk-slider-thumb"></media-slider-thumb>
				<media-slider-value class="amk-slider-value" type="pointer"></media-slider-value>
			</media-time-slider>
			<media-time-group class="amk-time">
				<media-time type="current"></media-time>
				<media-time-separator></media-time-separator>
				<media-time type="duration"></media-time>
			</media-time-group>
			<media-captions-button class="amk-button">
				<media-icon class="amk-icon-captions-off" name="captions-off"></media-icon>
				<media-icon class="amk-icon-captions-on" name="captions-on"></media-icon>
			</media-captions-button>
		</media-controls-group>
	</media-controls-content>
</media-controls>`

/**
 * Build the floating control bar for a video slide. It lives inside the slide's
 * `<video-player>` so its controls read that player's state, but it is a
 * `popover`: shown through the Popover API it renders in the top layer,
 * anchored to the viewport bottom regardless of the zoom transform PhotoSwipe
 * applies to the slide. Browsers without the Popover API render it in place.
 */
function createFloatingControls(): HTMLElement {
	const controls = document.createElement('div')
	controls.className = 'pswp__floating-controls'
	controls.setAttribute('popover', 'manual')
	controls.innerHTML = FLOATING_CONTROLS_HTML

	// Stop pointer events on the control bar from reaching PhotoSwipe's gesture
	// handler, so dragging the scrubber doesn't trigger a swipe/close.
	controls.addEventListener('pointerdown', (pointerEvent) => {
		pointerEvent.stopPropagation()
	})

	return controls
}

function showPopover(element: HTMLElement): void {
	const { showPopover: show } = element as PopoverCapable
	if (show === undefined || element.matches(':popover-open')) {
		return
	}

	show.call(element)
}

function hidePopover(element: HTMLElement): void {
	const { hidePopover: hide } = element as PopoverCapable
	if (hide === undefined || !element.matches(':popover-open')) {
		return
	}

	hide.call(element)
}

/**
 * Release a lightbox player that never reached the DOM. Connected players tear
 * themselves down when removed (Video.js elements destroy themselves, media
 * elements release their engine), but a player that was built and discarded
 * without ever being appended has no disconnect to trigger that, and a media
 * element starts loading as soon as it has a source.
 */
function destroyDetachedPlayer(wrapper: HTMLElement): void {
	type DetachedMedia = Element & { adapter?: { destroy(): void } }
	type DetachedPlayer = Element & { destroy(): void }
	wrapper.querySelector<DetachedMedia>(VIDEO_ELEMENT_SELECTOR)?.adapter?.destroy()
	wrapper.querySelector<DetachedPlayer>('video-player')?.destroy()
}

/** Type guard for video slide data stored in content.data. */
function isVideoData(data: Record<string, unknown>): data is Record<string, unknown> & {
	videoContainer: HTMLElement
	videoElement: VideoElementTag
	videoHlsOptions: string
	videoPoster: string
	videoSrc: string
} {
	return data.type === 'video' && data.videoContainer instanceof HTMLElement
}

/** Type guard for picture slide data stored in content.data. */
function isPictureData(data: Record<string, unknown>): data is Record<string, unknown> & {
	pictureContainer: HTMLElement
} {
	return data.type === 'picture' && data.pictureContainer instanceof HTMLElement
}

/**
 * Find the on-page subtree to clone into the lightbox slide. In selector mode
 * the anchor wraps a `<div>` containing both `<picture class="amk-light">` and
 * `<picture class="amk-dark">`, toggled by global CSS — clone the wrapping
 * `<div>` so the toggle keeps working in the cloned DOM. In media mode (and for
 * any other shape) clone the first `<picture>` descendant.
 */
function findPictureSubtree(container: HTMLElement): HTMLElement | undefined {
	const wrapper = container.querySelector(
		':scope > div:has(> picture.amk-dark):has(> picture.amk-light)',
	)
	if (wrapper instanceof HTMLElement) {
		return wrapper
	}

	const picture = container.querySelector('picture')
	return picture instanceof HTMLElement ? picture : undefined
}

/**
 * Pick the currently-visible `<img>` inside a picture container. In media mode
 * there is one `<img>` and it's always visible; in selector mode there are two
 * (`amk-light`/`amk-dark`) and only one is `display: block` at any time.
 */
function findVisibleImage(container: HTMLElement): HTMLImageElement | undefined {
	const images = container.querySelectorAll('img')
	for (const image of images) {
		if (!(image instanceof HTMLImageElement)) {
			continue
		}

		const ancestorPicture = image.closest('picture')
		if (ancestorPicture && getComputedStyle(ancestorPicture).display === 'none') {
			continue
		}

		return image
	}

	return undefined
}

/**
 * Query a media element (video, hlsjs-video, youtube-video, vimeo-video) and
 * return it as HTMLMediaElement or null.
 */
function queryVideoElement(root: Element | null | undefined): HTMLMediaElement | null {
	const element = root?.querySelector(VIDEO_ELEMENT_SELECTOR)
	if (element instanceof HTMLMediaElement) {
		return element
	}

	// Video.js custom media elements expose the HTMLMediaElement playback API
	// (play/pause/currentTime/paused) on the host — safe to treat as one.
	if (!element) {
		return null // eslint-disable-line unicorn/no-null -- matching DOM API return type
	}

	return element as unknown as HTMLMediaElement
}

/**
 * Parse the structured-source options serialized by VideoPlayer.astro for
 * `<hlsjs-video>`. Falls back to no options when the JSON is malformed.
 */
function parseHlsOptions(json: string): Omit<HlsSource, 'src'> {
	if (json === '') {
		return {}
	}

	try {
		const parsed: unknown = JSON.parse(json)
		return typeof parsed === 'object' && parsed !== null ? parsed : {}
	} catch {
		console.warn('[astro-media-kit] Failed to parse HLS options:', json)
		return {}
	}
}

/**
 * Parse a `data-pswp-width` / `data-pswp-height` dataset value, falling back
 * when it's absent, non-numeric, or zero (same falsy set `Number(x) ||
 * fallback` covered: 0, -0, and NaN).
 */
function parseDimension(value: string | undefined, fallback: number): number {
	const parsed = Number(value)
	return parsed !== 0 && !Number.isNaN(parsed) ? parsed : fallback
}

/**
 * Kick off playback. Safe to call multiple times — `play()` is idempotent on an
 * already-playing element. Surfaces rejection reasons (autoplay blocked,
 * network error) instead of swallowing them.
 */
function tryPlay(video: HTMLMediaElement): void {
	// Fire-and-forget async IIFE — callers intentionally don't await playback.
	void (async () => {
		try {
			await video.play()
		} catch (error) {
			console.warn('[astro-media-kit] Lightbox video play() rejected:', error)
		}
	})()
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

	// The floating control bar of the active video slide. Each video slide
	// builds its own bar (see `contentLoad`); only the current slide's bar is
	// shown, via the Popover API, so it stays anchored to the viewport bottom
	// regardless of fit/fill/native zoom on the slide.
	let activeControls: HTMLElement | undefined
	// Slide wrappers whose player has been appended to the DOM at least once;
	// anything else must be torn down explicitly (see `destroyDetachedPlayer`).
	const connectedPlayers = new WeakSet<HTMLElement>()
	let autohideTimerId: ReturnType<typeof setTimeout> | undefined
	let pointerListenersCleanup: (() => void) | undefined
	let keyboardListenerCleanup: (() => void) | undefined

	// Autohide the floating bar based on pointer activity within the PhotoSwipe
	// root rather than the slide's `<media-container>`. The container only
	// registers activity over the video itself — in fit mode, moving through
	// the letterbox gap would otherwise mark the user inactive before they
	// reach the bar. Tracking pointer activity on the whole viewport fixes it.
	const markFloatingActive = (): void => {
		if (!activeControls) {
			return
		}

		delete activeControls.dataset.userInactive
		if (autohideTimerId !== undefined) {
			clearTimeout(autohideTimerId)
		}

		autohideTimerId = setTimeout(() => {
			if (activeControls) {
				activeControls.dataset.userInactive = ''
			}
		}, USER_INACTIVE_MS)
	}

	const hideFloatingControls = (): void => {
		if (activeControls) {
			hidePopover(activeControls)
			activeControls = undefined
		}

		if (autohideTimerId === undefined) {
			return
		}

		clearTimeout(autohideTimerId)
		autohideTimerId = undefined
	}

	// Single source of truth: read `pswp.currSlide` and show/hide the floating
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
	// A popover can only be shown once it is connected, which is also when
	// its controls first receive the player store.
	const syncFloatingBar = (): void => {
		const content = lightbox.pswp?.currSlide?.content
		const controls =
			content && isVideoData(content.data)
				? content.element?.querySelector<HTMLElement>('.pswp__floating-controls')
				: undefined
		if (!controls?.isConnected) {
			hideFloatingControls()
			return
		}

		if (activeControls !== controls) {
			hideFloatingControls()
			activeControls = controls
			showPopover(controls)
		}

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
			const videoElement = parseVideoElementTag(element.dataset.pswpVideoElement)
			if (videoElement === undefined) {
				console.warn('[astro-media-kit] Lightbox video has no recognized media element:', element)
				return itemData
			}

			const posterUrl = element.dataset.pswpPoster ?? ''
			return {
				...itemData,
				height: parseDimension(element.dataset.pswpHeight, 1080),
				msrc: posterUrl,
				type: 'video',
				videoContainer: element,
				videoElement,
				videoHlsOptions: element.dataset.pswpVideoHlsOptions ?? '',
				videoPoster: posterUrl,
				videoSrc: element.dataset.pswpVideoSrc ?? '',
				width: parseDimension(element.dataset.pswpWidth, 1920),
			}
		}

		// Custom 'picture' type: anchor wraps a multi-variant <picture> (or, in
		// selector mode, a <div> with two pictures). contentLoad clones that
		// subtree as the slide content so the browser resolves dark/light
		// natively from the original media queries / CSS toggles.
		//
		// We populate msrc + width/height (the same fields PhotoSwipe auto-fills
		// for type='image' from the anchor) so the open/close zoom animation
		// has dimensions to interpolate and a placeholder source to fade. msrc
		// uses the visible <img>'s currentSrc when available so the thumb
		// matches the user's active dark/light variant; falls back to the
		// anchor's href.
		if (element.dataset.pswpType === 'picture') {
			const visibleImage = findVisibleImage(element)
			const msrc =
				visibleImage?.currentSrc ?? visibleImage?.src ?? element.getAttribute('href') ?? ''

			return {
				...itemData,
				height: parseDimension(element.dataset.pswpHeight, 0),
				msrc,
				pictureContainer: element,
				type: 'picture',
				width: parseDimension(element.dataset.pswpWidth, 0),
			}
		}

		return isSelfThumb ? { ...itemData, selfThumbElement: element } : itemData
	})

	// Enable placeholder for video and picture — required for the zoom
	// open/close animation. The placeholder is the low-res image PhotoSwipe
	// shows during the zoom transition; without it the transition snaps.
	lightbox.addFilter(
		'useContentPlaceholder',
		(usePlaceholder: boolean, content: { data: Record<string, unknown> }) => {
			const { type } = content.data
			return type === 'video' || type === 'picture' || usePlaceholder
		},
	)

	// Mirror the on-page <img>'s computed background-color onto a target element
	// (placeholder during the open zoom transition, content.element once
	// appended). Returns true when a non-transparent background was applied.
	// `getComputedStyle` resolves CSS `light-dark()` against the page's current
	// color-scheme, so this is correct for both media-mode and selector-mode
	// dark backgrounds.
	const mirrorVisibleImageBackground = (
		sourceContainer: HTMLElement,
		target: HTMLElement | null | undefined,
	): boolean => {
		if (!target) {
			return false
		}

		const visibleImage = findVisibleImage(sourceContainer)
		if (!visibleImage) {
			return false
		}

		const { backgroundColor } = getComputedStyle(visibleImage)
		if (['', 'rgba(0, 0, 0, 0)', 'transparent'].includes(backgroundColor)) {
			return false
		}

		target.style.backgroundColor = backgroundColor
		return true
	}

	// Tracks contents whose placeholder is carrying a background-color, so the
	// placeholder isn't destroyed by removePlaceholder() before the open zoom
	// animation can show it (the custom 'picture' handler calls onLoaded()
	// synchronously; the default 'image' path destroys the placeholder once
	// the high-res image loads — for cached SVGs that can fire before the
	// animation even starts).
	const placeholderBackgrounds = new WeakSet<object>()

	lightbox.addFilter(
		'isKeepingPlaceholder',
		(isKeeping: boolean, content: { data: Record<string, unknown> }) =>
			placeholderBackgrounds.has(content) || isKeeping,
	)

	// Mark video as zoomable so tap/double-tap triggers PhotoSwipe's secondary
	// zoom (and wheel-to-zoom). Default is false for non-image content.
	// 'picture' inherits the same zoomable-by-default behavior images get.
	lightbox.addFilter(
		'isContentZoomable',
		(isZoomable: boolean, content: { data: Record<string, unknown> }) => {
			const { type } = content.data
			return type === 'video' || type === 'picture' || isZoomable
		},
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

			// For picture: the anchor may contain two <picture> elements in
			// selector mode (one display:none, one display:block). PhotoSwipe's
			// default thumb pick is the first <img>, which can land on the
			// hidden one and break the open/close animation. Prefer the visible
			// <img> when there's a choice.
			if (itemData.type === 'picture' && itemData.pictureContainer instanceof HTMLElement) {
				const visibleImage = findVisibleImage(itemData.pictureContainer)
				if (visibleImage) {
					return visibleImage
				}
			}

			return itemData.selfThumbElement instanceof HTMLElement
				? itemData.selfThumbElement
				: (thumbElement ?? document.createElement('div'))
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
		// (uiRegister → destroy). Video.js hotkeys are scoped to a focused
		// player container, which the slide's container never is (clicks
		// pass through it to PhotoSwipe), so this stays a document listener.
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

			// Controls that activate on Space themselves (Video.js media buttons,
			// PhotoSwipe's own buttons) own the key; toggling here as well
			// would double-fire.
			if (target instanceof Element && target.closest('button, a[href], [role="button"]')) {
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

	lightbox.on('closingAnimationStart', () => {
		// Fade the bar out with the closing animation.
		hideFloatingControls()

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

	// Mirror the on-page <img>'s background-color onto both the placeholder
	// (visible during the open zoom transition) and `content.element` (visible
	// once appended, post-transition). Hooked into multiple events because the
	// placeholder doesn't exist at every event firing — for content loaded via
	// PhotoSwipeLightbox.preload() (the default path on first open), the
	// initial `contentLoad` fires before the slide is assigned, so
	// `content.placeholder` is still undefined; the placeholder gets created
	// later in `slide.append → content.load`, but `contentLoad` doesn't
	// re-dispatch because `content.element` already exists from preload.
	// `contentResize` (dispatched from `slide.updateContentSize` right after
	// the placeholder is created) catches that case.
	const mirrorContentBackgrounds = (content: {
		data: Record<string, unknown>
		element?: HTMLDivElement | HTMLElement | HTMLImageElement | undefined
		placeholder?: undefined | { element: HTMLDivElement | HTMLElement | HTMLImageElement | null }
	}): void => {
		if (content.data.type === 'video') {
			return
		}

		const sourceElement = content.data.element
		if (!(sourceElement instanceof HTMLElement)) {
			return
		}

		if (mirrorVisibleImageBackground(sourceElement, content.placeholder?.element)) {
			placeholderBackgrounds.add(content)
		}

		if (content.element instanceof HTMLElement) {
			mirrorVisibleImageBackground(sourceElement, content.element)
		}
	}

	lightbox.on('contentLoad', (event) => {
		mirrorContentBackgrounds(event.content)
	})

	lightbox.on('contentResize', (event) => {
		mirrorContentBackgrounds(event.content)
	})

	lightbox.on('contentAppend', (event) => {
		mirrorContentBackgrounds(event.content)
	})

	// Clone the on-page <picture> subtree as the slide content so the browser
	// resolves the active dark/light variant natively from the original media
	// queries (or selector-mode CSS). Mirrors the video custom-type handler:
	// preventDefault to take over, set `content.element` to a `pswp__img`-classed
	// element, and call `onLoaded()` to flip out of the LOADING state. The
	// SSR-extracted light URL on the anchor's `href` / `data-pswp-srcset`
	// remains the no-JS fallback and the open-animation thumb source.
	lightbox.on('contentLoad', (event) => {
		const { content } = event
		if (!isPictureData(content.data)) {
			return
		}

		const subtree = findPictureSubtree(content.data.pictureContainer)
		if (!subtree) {
			return
		}

		event.preventDefault()

		const clone = subtree.cloneNode(true) as HTMLElement

		// PhotoSwipe's click-to-toggle-zoom keys off `event.target.classList`
		// containing `pswp__img`. Apply the class to the slide element; CSS
		// in Zoomer.astro's global block makes inner picture/img fill the
		// slide and sets pointer-events: none so clicks fall through. The
		// `contentAppend` handler above mirrors the on-page <img>'s
		// background-color onto this clone once PhotoSwipe is about to append
		// it, so the dark/light background fill is preserved at full zoom.
		clone.classList.add('pswp__img', 'amk-pswp-picture')

		// PhotoSwipe types `content.element` narrowly as
		// HTMLDivElement | HTMLImageElement | undefined; in practice the
		// custom-content docs sanction setting it to any element (the video
		// handler below does the same with a div). The clone is a <picture>
		// (media mode) or a <div> (selector mode), neither of which strictly
		// fits the typed union.

		content.element = clone as HTMLDivElement

		// Signal custom content ready, same trick as the video handler below.

		;(content as unknown as { onLoaded: () => void }).onLoaded()
	})

	// Create a fresh Video.js player in the lightbox. Runs on first load and
	// again every time PhotoSwipe re-appends the slide, because `contentRemove`
	// below discards the previous player (see there for why).
	lightbox.on('contentLoad', (event) => {
		const { content } = event
		if (!isVideoData(content.data)) {
			return
		}

		event.preventDefault()

		const {
			videoContainer,
			videoElement: videoElementTag,
			videoHlsOptions,
			videoPoster,
			videoSrc,
		} = content.data

		// Build the media element matching the inline player's service.
		const videoElement = document.createElement(videoElementTag)
		videoElement.className = 'amk-media'
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
		// The attribute only sets the default; a native <video> created after
		// parsing keeps its live `muted` state unless the property is set too.
		;(videoElement as unknown as HTMLMediaElement).muted = true
		if (videoPoster !== '') {
			videoElement.setAttribute('poster', videoPoster)
		}

		if (videoElementTag === 'hlsjs-video') {
			// No picture-in-picture control is offered, so keep the browser's
			// own affordance off, as the inline player does.
			videoElement.setAttribute('disablepictureinpicture', '')
			// The structured source carries the playback options with the URL,
			// so hls.js is created once with them.
			;(videoElement as HlsJsVideoElement).source = {
				src: videoSrc,
				...parseHlsOptions(videoHlsOptions),
			}
		} else {
			videoElement.setAttribute('src', videoSrc)
		}

		// <video-player> owns state; <media-container> is the layout box and
		// the focusable, labelled player. No gestures or hotkeys: clicks fall
		// through to PhotoSwipe (zoom) and the Space key is handled at the
		// document level above.
		const player = document.createElement('video-player')
		const container = document.createElement('media-container')
		container.className = 'pswp__video-container'
		const inlineLabel = videoContainer
			.querySelector('media-container, [role="group"]')
			?.getAttribute('aria-label')
		if (inlineLabel !== null && inlineLabel !== undefined && inlineLabel !== '') {
			container.setAttribute('aria-label', inlineLabel)
		}

		container.append(videoElement)
		player.append(container, createFloatingControls())

		// Wrapper element. PhotoSwipe's click handler keys off
		// `event.target.classList` — it fires `imageClickAction` only when the
		// target carries `pswp__img`. Paired with `pointer-events: none` on
		// the container (see amk-video.css), clicks fall through to this
		// wrapper, so the video behaves exactly like an image slide
		// (single-click zoom, zoom-in / grab cursors, etc.).
		const wrapper = document.createElement('div')
		wrapper.className = 'pswp__video-wrapper pswp__img'
		wrapper.append(player)

		content.element = wrapper

		// Signal that custom content is ready. Without this, PhotoSwipe
		// keeps the content in LOADING state, which breaks slide transition
		// animations for the entire gallery.

		;(content as unknown as { onLoaded: () => void }).onLoaded()

		// Showing the bar happens later via `syncFloatingBar` on
		// `appendHeavyContent` — only once the player is actually connected
		// to the DOM, which is when the bar's controls receive the store and
		// when a popover may be shown at all.

		// Resume where the previous lightbox player (same slide, re-appended)
		// or the inline player left off. For hlsjs-video the eager set lands
		// before the engine attaches and is applied once media loads. For
		// embed elements (vimeo-video / youtube-video) the setter stores the
		// value and replays it after the iframe API is ready — add one-shot
		// listeners as a belt-and-braces fallback in case the eager set races
		// the element's internal initialization.
		const { lightboxTime } = content.data
		delete content.data.lightboxTime
		const inlineVideo = queryVideoElement(videoContainer)
		const resumeTime =
			typeof lightboxTime === 'number' ? lightboxTime : (inlineVideo?.currentTime ?? 0)
		if (resumeTime <= 0) {
			return
		}

		const proxiedVideo = videoElement as unknown as HTMLMediaElement
		proxiedVideo.currentTime = resumeTime
		const applySeek = (): void => {
			proxiedVideo.currentTime = resumeTime
		}

		// `loadcomplete` is dispatched by vimeo-video / youtube-video once the
		// iframe API is ready. `loadedmetadata` covers the native-video path
		// (video, hlsjs-video).
		videoElement.addEventListener('loadcomplete', applySeek, { once: true })
		videoElement.addEventListener('loadedmetadata', applySeek, { once: true })
	})

	lightbox.on('change', syncFloatingBar)
	lightbox.on('appendHeavyContent', syncFloatingBar)

	// Auto-play on activate, pause on deactivate. Separate from the bar
	// binding above — this is purely video lifecycle. On first open,
	// `contentActivate` fires BEFORE the content wrapper is attached to the
	// slide (attachment happens in `appendHeavyContent` at
	// `openingAnimationEnd`). The media engine doesn't start loading until
	// the element is connected, so calling `play()` here has no effect on
	// first-open. The `appendHeavyContent` handler below re-runs `tryPlay`
	// once the element is in the DOM.
	lightbox.on('contentActivate', ({ content }) => {
		if (!isVideoData(content.data)) {
			return
		}

		// A stale deactivation record would misreport the play state on
		// close; the live element is the source of truth from here on.
		wasPlayingMap.delete(content.data.videoContainer)

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
	// the critical autoplay moment on first open — before this, the media
	// element hasn't initialized its engine (it waits for `connectedCallback`).
	lightbox.on('appendHeavyContent', ({ slide }) => {
		// `slide.content` is always assigned in the Slide constructor, so no
		// existence check is needed.
		const { content } = slide
		if (!isVideoData(content.data)) {
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
		// changes in multi-item galleries — harmless, the entry is cleared the
		// next time the slide activates, and it's only read from the close
		// path.
		const wasPlaying = !video.paused
		wasPlayingMap.set(content.data.videoContainer, wasPlaying)
		if (wasPlaying) {
			video.pause()
		}
	})

	// Don't build players for slides PhotoSwipe only preloads (two away by
	// default): a media element starts loading as soon as it has a source,
	// connected or not, and a player that never reaches the DOM would never
	// tear itself down. Slides build their player when they are created.
	lightbox.on('contentLazyLoad', (event) => {
		if (event.content.data.type === 'video') {
			event.preventDefault()
		}
	})

	lightbox.on('contentAppend', ({ content }) => {
		if (isVideoData(content.data) && content.element) {
			connectedPlayers.add(content.element)
		}
	})

	// Discard the player whenever PhotoSwipe detaches the slide. PhotoSwipe
	// caches content and re-appends the same `content.element` when the user
	// swipes back, but Video.js elements destroy themselves two animation
	// frames after disconnecting (and media elements tear down their engine),
	// so a re-appended player would be dead. Dropping `content.element` makes
	// the next `load()` re-dispatch `contentLoad`, which builds a fresh player
	// that resumes from the stashed position. Removing the element here also
	// releases the media engine — nothing keeps fetching in the background.
	lightbox.on('contentRemove', ({ content }) => {
		if (!isVideoData(content.data)) {
			return
		}

		const video = queryVideoElement(content.element)
		if (video && video.currentTime > 0) {
			content.data.lightboxTime = video.currentTime
		}

		const wrapper = content.element
		if (activeControls && wrapper?.contains(activeControls)) {
			hideFloatingControls()
		}

		if (wrapper) {
			if (connectedPlayers.has(wrapper)) {
				wrapper.remove()
				connectedPlayers.delete(wrapper)
			} else {
				destroyDetachedPlayer(wrapper)
			}
		}

		content.element = undefined
	})

	// Sync position back to the inline player when content leaves the cache
	// (and on close, below). The player itself was already discarded in
	// `contentRemove`, so this reads the stashed position.
	lightbox.on('contentDestroy', ({ content }) => {
		if (!isVideoData(content.data)) {
			return
		}

		syncBackToInline(content)
	})

	lightbox.on('destroy', () => {
		// Do NOT guard on `lightbox.pswp` here. PhotoSwipe may null `pswp`
		// before dispatching `destroy`, and an early-return in that branch
		// would skip cleanup — leaking the pointer and keyboard listeners.
		//
		// `destroy` dispatches before PhotoSwipe tears the slides down, so the
		// current slide's player is still live: capture its play state (a
		// close does not deactivate the slide) and sync it back now.
		const content = lightbox.pswp?.currSlide?.content
		if (content && isVideoData(content.data)) {
			const video = queryVideoElement(content.element)
			if (video && !wasPlayingMap.has(content.data.videoContainer)) {
				wasPlayingMap.set(content.data.videoContainer, !video.paused)
			}

			syncBackToInline(content)
		}

		hideFloatingControls()
		pointerListenersCleanup?.()
		pointerListenersCleanup = undefined
		keyboardListenerCleanup?.()
		keyboardListenerCleanup = undefined

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
			return figcaption?.getHTML() ?? false
		},
		type: 'below',
	})

	// Guard against plugin crash when pswp.currSlide is undefined during
	// the initial 'change' event in pswp.init(). The plugin calls
	// showCaption(pswp.currSlide) without checking for undefined.

	const plugin = captionPlugin as unknown as {
		showCaption: (slide: unknown) => void
	}
	const originalShowCaption = plugin.showCaption.bind(plugin)
	plugin.showCaption = (slide: unknown) => {
		// The plugin passes `pswp.currSlide`, which is a slide object or nullish.
		if (slide === null || slide === undefined) {
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
 * playing/paused status. Reads the live lightbox player when it still exists
 * (the `destroy` path) and the position stashed by `contentRemove` otherwise.
 * Works for all media element types: hlsjs-video reads currentTime off its
 * inner `<video>` and embed elements (vimeo-video / youtube-video) expose the
 * last-known time cached from their `timeupdate` handlers, so the synchronous
 * getter is non-blocking in every case.
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

	const { lightboxTime } = content.data
	const time = lightboxVideo?.currentTime ?? (typeof lightboxTime === 'number' ? lightboxTime : 0)
	if (time > 0) {
		inlineVideo.currentTime = time
	}

	// Resume inline playback if the lightbox video was playing when it was
	// deactivated or when the lightbox closed. `wasPlayingMap` is populated in
	// `contentDeactivate` (before the pause) and in the `destroy` handler.
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
	const itemCount = document.querySelectorAll(
		`.pswp-zoom[data-pswp-gallery="${CSS.escape(name)}"]`,
	).length
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
// The listener is attached to the controls surface, not to the `.pswp-zoom`
// container. PhotoSwipe binds its own click handler to each gallery node
// during `init()` (see photoswipe/lightbox.js `_bindEvents`), and
// `stopPropagation` on a sibling listener attached to the same node can't
// stop PhotoSwipe's handler — that would require `stopImmediatePropagation`
// plus guaranteed earlier registration. Stopping propagation from a
// descendant instead means the click never reaches the `.pswp-zoom` node, so
// neither our handler nor PhotoSwipe's runs there. The controls surface has
// `pointer-events: none` itself, so clicks between controls still fall
// through to the video and open the lightbox. The `.pswp-video-trigger`
// (zoom) button has its own click listener that stops propagation and opens
// the lightbox programmatically, so it continues to work unchanged.
for (const container of document.querySelectorAll<HTMLElement>(
	'.pswp-zoom[data-pswp-type="video"]',
)) {
	for (const control of container.querySelectorAll<HTMLElement>('media-controls-content')) {
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

		if (galleryName !== undefined && galleryName !== '') {
			const lb = galleryLightboxes.get(galleryName)
			if (!lb) {
				return
			}

			const children = [
				...document.querySelectorAll<HTMLElement>(
					`.pswp-zoom[data-pswp-gallery="${CSS.escape(galleryName)}"]`,
				),
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
