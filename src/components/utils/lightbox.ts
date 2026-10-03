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

// @ts-expect-error — no type declarations available for this package
import PhotoSwipeDynamicCaption from 'photoswipe-dynamic-caption-plugin'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import { parseVideoElementTag } from '../internal/video-source'
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
 * Parse a `data-pswp-width` / `data-pswp-height` dataset value, falling back
 * when it's absent, non-numeric, or zero (same falsy set `Number(x) ||
 * fallback` covered: 0, -0, and NaN).
 */
function parseDimension(value: string | undefined, fallback: number): number {
	const parsed = Number(value)
	return parsed !== 0 && !Number.isNaN(parsed) ? parsed : fallback
}

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

function createLightbox(
	options: LightboxOptions,
	{
		registerVideo,
		singleItem = false,
	}: { registerVideo?: (lightbox: PhotoSwipeLightbox) => void; singleItem?: boolean } = {},
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
	})

	lightbox.on('closingAnimationStart', () => {
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

	registerVideo?.(lightbox)

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

	lightbox.on('destroy', () => {
		document.documentElement.classList.remove('amk-lock-scroll')
		document.documentElement.style.removeProperty('--amk-scrollbar-width')
	})

	lightbox.init()
	return lightbox
}

// Each navigation owns its lightboxes and event listeners. Abort pending imports
// before replacing the page so a slow load cannot bind to a later document.
let pageController: AbortController | undefined
let disposeLightboxes: (() => void) | undefined

function destroyLightboxes(): void {
	pageController?.abort()
	pageController = undefined
	disposeLightboxes?.()
	disposeLightboxes = undefined
}

async function initializeLightboxes(): Promise<void> {
	if (pageController) {
		return
	}

	const controller = new AbortController()
	pageController = controller
	try {
		const videoModule = document.querySelector('.pswp-zoom[data-pswp-type="video"]')
			? await import('./video-lightbox')
			: undefined
		if (controller.signal.aborted) {
			return
		}

		disposeLightboxes = bindLightboxes(controller.signal, videoModule?.registerVideoLightbox)
	} catch (error) {
		if (!controller.signal.aborted) {
			destroyLightboxes()
			console.error('[astro-media-kit] Could not initialize lightboxes:', error)
		}
	}
}

function bindLightboxes(
	signal: AbortSignal,
	registerVideo: ((lightbox: PhotoSwipeLightbox) => void) | undefined,
): () => void {
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
		{ registerVideo, singleItem: true },
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
				children: `.pswp-zoom[data-pswp-gallery="${CSS.escape(name)}"]`,
				counter: false,
				gallery: 'body',
				initialZoomLevel: 'fit',
				loop: false,
				secondaryZoomLevel,
				zoom: false,
			},
			{ registerVideo, singleItem: itemCount === 1 },
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
			control.addEventListener(
				'click',
				(event) => {
					event.stopPropagation()
				},
				{ signal },
			)
		}
	}

	// Video trigger buttons: open the lightbox programmatically.
	for (const trigger of document.querySelectorAll<HTMLButtonElement>('.pswp-video-trigger')) {
		trigger.addEventListener(
			'click',
			(event) => {
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
			},
			{ signal },
		)
	}

	return () => {
		standaloneLightbox.destroy()
		for (const lightbox of galleryLightboxes.values()) {
			lightbox.destroy()
		}
	}
}

void initializeLightboxes()
document.addEventListener('astro:page-load', () => {
	void initializeLightboxes()
})
document.addEventListener('astro:before-swap', destroyLightboxes)
