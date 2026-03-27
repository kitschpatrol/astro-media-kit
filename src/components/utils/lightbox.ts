/* eslint-disable ts/no-restricted-types */
/**
 * Shared PhotoSwipe lightbox initialization for both image (Zoomer) and video
 * (VideoHls) components. Supports mixed galleries containing both content types.
 *
 * Images use the default PhotoSwipe image type.
 * Videos use a custom 'video' type — a duplicate player is created in the
 * lightbox (the inline player stays on the page, consistent with how images
 * work). Playback position is synced: the lightbox player seeks to the inline
 * player's current time on open, and the inline player syncs back on close.
 */

import type { HlsVideoElement } from 'hls-video-element'
// @ts-expect-error — no type declarations available for this package
import PhotoSwipeDynamicCaption from 'photoswipe-dynamic-caption-plugin'
import 'photoswipe-dynamic-caption-plugin/photoswipe-dynamic-caption-plugin.css'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'

type LightboxOptions = ConstructorParameters<typeof PhotoSwipeLightbox>[0]

/** Type guard for video slide data stored in content.data. */
function isVideoData(data: Record<string, unknown>): data is Record<string, unknown> & {
	videoConfig: string
	videoContainer: HTMLElement
	videoPoster: string
	videoSrc: string
} {
	return data.type === 'video' && data.videoContainer instanceof HTMLElement
}

/** Query an hls-video element and return it as HTMLMediaElement or null. */
function queryHlsVideo(root: Element | null | undefined): HTMLMediaElement | null {
	const element = root?.querySelector('hls-video')
	if (element instanceof HTMLMediaElement) return element
	// HlsVideoElement extends HTMLElement with play/pause/currentTime via
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

	// --- Filters ---

	// Extract video data from DOM elements.
	lightbox.addFilter('domItemData', (itemData: Record<string, unknown>, element: HTMLElement) => {
		if (element.dataset.pswpType === 'video') {
			const posterUrl = element.dataset.pswpPoster ?? ''
			return {
				...itemData,
				height: Number(element.dataset.pswpHeight) || 1080,
				msrc: posterUrl,
				type: 'video',
				videoConfig: element.dataset.pswpVideoConfig ?? '',
				videoContainer: element,
				videoPoster: posterUrl,
				videoSrc: element.dataset.pswpVideoSrc ?? '',
				width: Number(element.dataset.pswpWidth) || 1920,
			}
		}

		return itemData
	})

	// Disable pinch-zoom gestures for video slides.
	lightbox.addFilter(
		'isContentZoomable',
		(isZoomable: boolean, content: { data: Record<string, unknown> }) =>
			content.data.type === 'video' ? false : isZoomable,
	)

	// Enable placeholder for video — required for the zoom open/close animation.
	lightbox.addFilter(
		'useContentPlaceholder',
		(usePlaceholder: boolean, content: { data: Record<string, unknown> }) =>
			content.data.type === 'video' ? true : usePlaceholder,
	)

	// Use video container as the zoom animation origin.
	lightbox.addFilter(
		'thumbEl',
		(
			thumbElement: HTMLElement | null | undefined,
			itemData: Record<string, unknown>,
		): HTMLElement => {
			if (itemData.type === 'video' && itemData.videoContainer instanceof HTMLElement) {
				return itemData.videoContainer
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
	})

	// --- Content lifecycle ---

	// Create a fresh video player in the lightbox.
	lightbox.on('contentLoad', (event) => {
		const { content } = event
		if (!isVideoData(content.data)) return
		event.preventDefault()

		const { videoConfig, videoContainer, videoPoster, videoSrc } = content.data

		// Build <hls-video> element.
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- Custom element not in HTMLElementTagNameMap
		const hlsVideo = document.createElement('hls-video') as HlsVideoElement
		hlsVideo.setAttribute('crossorigin', 'anonymous')
		hlsVideo.setAttribute('playsinline', 'true')
		hlsVideo.setAttribute('preload', 'metadata')
		if (videoPoster) hlsVideo.setAttribute('poster', videoPoster)

		// Apply hls.js config before setting src.
		if (videoConfig) {
			// eslint-disable-next-line ts/no-unsafe-assignment -- JSON.parse returns any
			hlsVideo.config = JSON.parse(videoConfig)
		}

		hlsVideo.setAttribute('src', videoSrc)

		// Build <media-controller> with lightbox control style:
		// gesturesdisabled (no click-to-play), no fullscreen button.
		const controller = document.createElement('media-controller')
		controller.setAttribute('autohide', '1')
		controller.setAttribute('gesturesdisabled', '')
		controller.classList.add('lightbox')
		hlsVideo.setAttribute('slot', 'media')
		controller.append(hlsVideo)

		const controlBar = document.createElement('media-control-bar')
		for (const tag of [
			'media-play-button',
			'media-mute-button',
			'media-volume-range',
			'media-time-range',
			'media-time-display',
		]) {
			controlBar.append(document.createElement(tag))
		}

		controller.append(controlBar)

		// Stop pointer events on the control bar from reaching PhotoSwipe's
		// gesture handler on scrollWrap. Without this, dragging the scrubber
		// triggers PhotoSwipe's swipe gesture.
		controlBar.addEventListener('pointerdown', (pointerEvent) => {
			pointerEvent.stopPropagation()
		})

		// Hide controls when inactive, even while paused/ended.
		// Media-chrome's shadow DOM keeps controls visible when mediapaused
		// is set. Inline styles override ::slotted() rules.
		const { style: barStyle } = controlBar
		controller.addEventListener('userinactivechange', () => {
			if (controller.hasAttribute('userinactive')) {
				barStyle.opacity = '0'
				barStyle.pointerEvents = 'none'
			} else {
				barStyle.opacity = ''
				barStyle.pointerEvents = ''
			}
		})

		// Wrapper element — PhotoSwipe controls its dimensions.
		const wrapper = document.createElement('div')
		wrapper.className = 'pswp__video-wrapper'
		wrapper.append(controller)

		content.element = wrapper

		// Signal that custom content is ready. Without this, PhotoSwipe
		// keeps the content in LOADING state, which breaks slide transition
		// animations for the entire gallery.
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- onLoaded is a public method on Content, not in the types
		;(content as unknown as { onLoaded: () => void }).onLoaded()

		// Sync playback position from inline player.
		const inlineVideo = queryHlsVideo(videoContainer)
		if (inlineVideo && inlineVideo.currentTime > 0) {
			hlsVideo.currentTime = inlineVideo.currentTime
		}
	})

	// Auto-play when slide becomes active.
	lightbox.on('contentActivate', ({ content }) => {
		if (!isVideoData(content.data)) return
		const video = queryHlsVideo(content.element)
		if (video) {
			void video.play()
		}

		// Pause the inline player.
		const inlineVideo = queryHlsVideo(content.data.videoContainer)
		if (inlineVideo && !inlineVideo.paused) {
			inlineVideo.pause()
		}
	})

	// Pause when swiping away to another slide.
	lightbox.on('contentDeactivate', ({ content }) => {
		if (!isVideoData(content.data)) return
		const video = queryHlsVideo(content.element)
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
	})

	// Caption plugin: extract caption from the <figcaption> sibling of the
	// .pswp-zoom element inside the <figure> wrapper rendered by Caption.astro.
	// eslint-disable-next-line ts/no-unsafe-call -- plugin registers itself via constructor side effect
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
	const lightboxVideo = queryHlsVideo(content.element)
	const inlineVideo = queryHlsVideo(content.data.videoContainer)

	if (lightboxVideo && inlineVideo && lightboxVideo.currentTime > 0) {
		inlineVideo.currentTime = lightboxVideo.currentTime
	}
}

// --- Initialize lightboxes ---

// Standalone items (zoom={true}, no gallery grouping).
const standaloneLightbox = createLightbox({
	gallery: '.pswp-zoom:not([data-pswp-gallery])',
})

// Grouped galleries — one lightbox per unique gallery name.
const galleryNames = new Set(
	[...document.querySelectorAll<HTMLElement>('.pswp-zoom[data-pswp-gallery]')].map(
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
		secondaryZoomLevel: 1,
		zoom: false,
	})
	galleryLightboxes.set(name, lb)
}

// Prevent clicks inside inline video containers from bubbling to body,
// where PhotoSwipe's gallery click handler would open the lightbox.
// The expand button (.pswp-video-trigger) handles its own click separately.
for (const container of document.querySelectorAll<HTMLElement>(
	'.pswp-zoom[data-pswp-type="video"]',
)) {
	container.addEventListener('click', (event) => {
		event.stopPropagation()
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
