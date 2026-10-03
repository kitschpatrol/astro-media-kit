/* eslint-disable ts/no-restricted-types */
import type PhotoSwipeLightbox from 'photoswipe/lightbox'
import type { VideoElementTag } from '../internal/video-source'
import type { CaptionSelection } from './video-captions'
import '../internal/videojs-ui'
import { setVideoSourceWhenReady, VIDEO_ELEMENT_SELECTOR } from '../internal/video-source'
import { readCaptionSelection, restoreCaptionSelection } from './video-captions'
import { cloneLightboxPlayer, createControlsActivity } from './video-lightbox-controls'

/** The Popover API, which older browsers lack. */
type PopoverCapable = Partial<Pick<HTMLElement, 'hidePopover' | 'showPopover'>>

/**
 * Tracks whether the lightbox player was playing at the moment it was
 * deactivated, keyed by the inline player's container element. Read during
 * `syncBackToInline` to decide whether to resume the inline player on close —
 * `contentDeactivate` pauses the lightbox video before `contentDestroy` fires,
 * so the paused/playing signal has to be captured earlier and stashed here.
 * WeakMap so entries drop when the container element goes away.
 */
const wasPlayingMap = new WeakMap<HTMLElement, boolean>()

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
	lightboxCaptions?: CaptionSelection
	videoContainer: HTMLElement
	videoElement: VideoElementTag
	videoHlsOptions: string
	videoPoster: string
	videoSrc: string
} {
	return data.type === 'video' && data.videoContainer instanceof HTMLElement
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

/** Add video playback to a PhotoSwipe instance before initialization. */
export function registerVideoLightbox(lightbox: PhotoSwipeLightbox): void {
	// The floating control bar of the active video slide. Each video slide
	// builds its own bar (see `contentLoad`); only the current slide's bar is
	// shown, via the Popover API, so it stays anchored to the viewport bottom
	// regardless of fit/fill/native zoom on the slide.
	let activeControls: HTMLElement | undefined
	// Slide wrappers whose player has been appended to the DOM at least once;
	// anything else must be torn down explicitly (see `destroyDetachedPlayer`).
	const connectedPlayers = new WeakSet<HTMLElement>()
	let activity: ReturnType<typeof createControlsActivity> | undefined
	let keyboardListenerCleanup: (() => void) | undefined
	const captionCleanup = new WeakMap<HTMLElement, () => void>()
	const markFloatingActive = (): void => activity?.markActive()

	const hideFloatingControls = (): void => {
		if (activeControls) {
			hidePopover(activeControls)
			activeControls = undefined
		}

		activity?.setControls(undefined)
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
			activity?.setControls(controls)
			showPopover(controls)
		}

		markFloatingActive()
	}

	lightbox.on('uiRegister', () => {
		const pswp = lightbox.pswp!
		if (pswp.element) {
			activity = createControlsActivity(pswp.element)
		}

		// Space key toggles play/pause on the active video slide, and is
		// swallowed on any slide so it doesn't scroll the page behind the
		// lightbox. Attached to the document while the lightbox is open
		// (uiRegister → destroy). Video.js hotkeys are scoped to a focused
		// player container, which the slide's container never is (clicks
		// pass through it to PhotoSwipe), so this stays a document listener.
		const handleKeydown = (event: KeyboardEvent): void => {
			if (event.defaultPrevented || event.repeat || (event.code !== 'Space' && event.key !== ' ')) {
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
			if (
				target instanceof Element &&
				target.closest('button, a[href], [role="button"], [role="slider"], media-dialog-popup')
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

	lightbox.on('closingAnimationStart', hideFloatingControls)

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

		const template = videoContainer.querySelector<HTMLTemplateElement>(
			'template[data-amk-lightbox-player]',
		)
		if (!template) {
			throw new Error('[astro-media-kit] Missing lightbox player template')
		}

		const fragment = cloneLightboxPlayer(template)
		const container = fragment.querySelector('media-container')!
		const controls = fragment.querySelector<HTMLElement>('.pswp__floating-controls')!
		const inlineVideo = queryVideoElement(videoContainer)
		const tracks = inlineVideo?.querySelectorAll('track') ?? []
		for (const track of tracks) {
			videoElement.append(track.cloneNode(true))
		}

		const inlineLabel = videoContainer
			.querySelector('media-container, [role="group"]')
			?.getAttribute('aria-label')
		if (inlineLabel !== null && inlineLabel !== undefined && inlineLabel !== '') {
			container.setAttribute('aria-label', inlineLabel)
		}

		container.prepend(videoElement)
		// Capture keeps slider gestures away from PhotoSwipe without swallowing focus.
		controls.addEventListener('pointerdown', (pointerEvent) => {
			pointerEvent.stopPropagation()
		})
		container.addEventListener('pointerdown', (pointerEvent) => {
			pointerEvent.stopPropagation()
		})
		container.addEventListener('click', (clickEvent) => {
			clickEvent.stopPropagation()
		})
		if (videoElementTag === 'hlsjs-video') {
			videoElement.setAttribute('disablepictureinpicture', '')
		}

		// Wrapper element. PhotoSwipe's click handler keys off
		// `event.target.classList` — it fires `imageClickAction` only when the
		// target carries `pswp__img`. Paired with `pointer-events: none` on
		// the container (see amk-video.css), clicks fall through to this
		// wrapper, so the video behaves exactly like an image slide
		// (single-click zoom, zoom-in / grab cursors, etc.).
		const wrapper = document.createElement('div')
		wrapper.className = 'pswp__video-wrapper pswp__img'
		wrapper.append(fragment)
		const selection =
			content.data.lightboxCaptions === undefined
				? inlineVideo
					? readCaptionSelection(inlineVideo)
					: 'off')
				: content.data.lightboxCaptions
		captionCleanup.set(
			wrapper,
			restoreCaptionSelection(videoElement as unknown as HTMLMediaElement, selection),
		)
		// Source is assigned after connection, once the player can observe startup errors.
		customElements.upgrade(wrapper)
		const unsubscribe = setVideoSourceWhenReady(videoElement, videoSrc, videoHlsOptions)
		const cleanupCaptions = captionCleanup.get(wrapper)!
		captionCleanup.set(wrapper, () => {
			unsubscribe()
			cleanupCaptions()
		})

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
		if (video) {
			content.data.lightboxCaptions = readCaptionSelection(video)
		}

		if (video && video.currentTime > 0) {
			content.data.lightboxTime = video.currentTime
		}

		const wrapper = content.element
		if (activeControls && wrapper?.contains(activeControls)) {
			hideFloatingControls()
		}

		if (wrapper) {
			captionCleanup.get(wrapper)?.()
			captionCleanup.delete(wrapper)
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
		activity?.destroy()
		activity = undefined
		keyboardListenerCleanup?.()
		keyboardListenerCleanup = undefined

		// Release page scroll lock. Safe to run unconditionally — no-op when
		// the class/variable aren't set (LOCK_PAGE_SCROLL was false).
		document.documentElement.classList.remove('amk-lock-scroll')
		document.documentElement.style.removeProperty('--amk-scrollbar-width')
	})
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

	const selection = lightboxVideo
		? readCaptionSelection(lightboxVideo)
		: content.data.lightboxCaptions
	if (selection !== undefined) {
		restoreCaptionSelection(inlineVideo, selection)
	}

	// Resume inline playback if the lightbox video was playing when it was
	// deactivated or when the lightbox closed. `wasPlayingMap` is populated in
	// `contentDeactivate` (before the pause) and in the `destroy` handler.
	if (wasPlayingMap.get(content.data.videoContainer)) {
		tryPlay(inlineVideo)
	}

	wasPlayingMap.delete(content.data.videoContainer)
}
