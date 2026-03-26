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
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'

function createLightbox(options: {
	children?: string
	gallery: string
}): PhotoSwipeLightbox {
	const lightbox = new PhotoSwipeLightbox({
		...options,
		pswpModule: () => import('photoswipe'),
	})

	// --- Filters ---

	// Extract video data from DOM elements.
	lightbox.addFilter(
		'domItemData',
		(itemData: Record<string, unknown>, element: HTMLElement) => {
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
		},
	)

	// Disable pinch-zoom gestures for video slides.
	lightbox.addFilter(
		'isContentZoomable',
		(isZoomable: boolean, content: { data: Record<string, unknown> }) =>
			content.data.type === 'video' ? false : isZoomable,
	)

	// Enable placeholder for video — required for the zoom open/close animation.
	lightbox.addFilter(
		'useContentPlaceholder',
		(
			usePlaceholder: boolean,
			content: { data: Record<string, unknown> },
		) => (content.data.type === 'video' ? true : usePlaceholder),
	)

	// Use video container as the zoom animation origin.
	lightbox.addFilter(
		'thumbEl',
		(
			thumbEl: HTMLElement | null | undefined,
			itemData: Record<string, unknown>,
		): HTMLElement => {
			if (
				itemData.type === 'video' &&
				itemData.videoContainer instanceof HTMLElement
			) {
				return itemData.videoContainer
			}

			return (thumbEl ?? document.createElement('div')) as HTMLElement
		},
	)

	// --- Content lifecycle ---

	// Create a fresh video player in the lightbox.
	lightbox.on('contentLoad', (e) => {
		const { content } = e
		if (content.data.type !== 'video') return
		e.preventDefault()

		const videoSrc = content.data.videoSrc as string
		const posterUrl = content.data.videoPoster as string
		const configJson = content.data.videoConfig as string

		// Build <hls-video> element.
		const hlsVideo = document.createElement(
			'hls-video',
		) as HlsVideoElement
		hlsVideo.setAttribute('crossorigin', 'anonymous')
		hlsVideo.setAttribute('playsinline', 'true')
		hlsVideo.setAttribute('preload', 'metadata')
		if (posterUrl) hlsVideo.setAttribute('poster', posterUrl)

		// Apply hls.js config before setting src.
		if (configJson) {
			hlsVideo.config = JSON.parse(configJson)
		}

		hlsVideo.setAttribute('src', videoSrc)

		// Build <media-controller> with full controls.
		const controller = document.createElement('media-controller')
		controller.setAttribute('autohide', '1')
		hlsVideo.setAttribute('slot', 'media')
		controller.append(hlsVideo)

		const controlBar = document.createElement('media-control-bar')
		for (const tag of [
			'media-play-button',
			'media-mute-button',
			'media-volume-range',
			'media-time-range',
			'media-time-display',
			'media-fullscreen-button',
		]) {
			controlBar.append(document.createElement(tag))
		}

		controller.append(controlBar)

		// Wrapper element — PhotoSwipe controls its dimensions.
		const wrapper = document.createElement('div')
		wrapper.className = 'pswp__video-wrapper'
		wrapper.append(controller)

		content.element = wrapper

		// Sync playback position from inline player.
		const container = content.data.videoContainer as HTMLElement
		const inlineVideo = container.querySelector(
			'hls-video',
		) as HTMLMediaElement | null
		if (inlineVideo && inlineVideo.currentTime > 0) {
			hlsVideo.currentTime = inlineVideo.currentTime
		}
	})

	// Auto-play when slide becomes active.
	lightbox.on('contentActivate', ({ content }) => {
		if (content.data.type !== 'video') return
		const video = content.element?.querySelector(
			'hls-video',
		) as HTMLMediaElement | null
		if (video) {
			void video.play()
		}

		// Pause the inline player.
		const container = content.data.videoContainer as HTMLElement
		const inlineVideo = container.querySelector(
			'hls-video',
		) as HTMLMediaElement | null
		if (inlineVideo && !inlineVideo.paused) {
			inlineVideo.pause()
		}
	})

	// Pause when swiping away to another slide.
	lightbox.on('contentDeactivate', ({ content }) => {
		if (content.data.type !== 'video') return
		const video = content.element?.querySelector(
			'hls-video',
		) as HTMLMediaElement | null
		if (video && !video.paused) {
			video.pause()
		}
	})

	// Sync position back to inline player and clean up lightbox player.
	lightbox.on('contentDestroy', ({ content }) => {
		if (content.data.type !== 'video') return
		syncBackToInline(content)
	})

	lightbox.on('destroy', () => {
		const pswp = lightbox.pswp
		if (!pswp) return
		const content = pswp.currSlide?.content
		if (content?.data.type === 'video') {
			syncBackToInline(content)
		}
	})

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
	const lightboxVideo = content.element?.querySelector(
		'hls-video',
	) as HTMLMediaElement | null
	const container = content.data.videoContainer as HTMLElement
	const inlineVideo = container?.querySelector(
		'hls-video',
	) as HTMLMediaElement | null

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
	[
		...document.querySelectorAll<HTMLElement>(
			'.pswp-zoom[data-pswp-gallery]',
		),
	].map((element) => element.dataset.pswpGallery!),
)

const galleryLightboxes = new Map<string, PhotoSwipeLightbox>()

for (const name of galleryNames) {
	const lb = createLightbox({
		children: `.pswp-zoom[data-pswp-gallery="${name}"]`,
		gallery: 'body',
	})
	galleryLightboxes.set(name, lb)
}

// Video trigger buttons: open the lightbox programmatically.
for (const trigger of document.querySelectorAll<HTMLButtonElement>(
	'.pswp-video-trigger',
)) {
	trigger.addEventListener('click', (event) => {
		event.stopPropagation()
		const container = trigger.closest('.pswp-zoom') as HTMLElement | null
		if (!container) return

		const galleryName = container.dataset.pswpGallery

		if (galleryName) {
			const lb = galleryLightboxes.get(galleryName)
			if (!lb) return
			const children = [
				...document.querySelectorAll<HTMLElement>(
					`.pswp-zoom[data-pswp-gallery="${galleryName}"]`,
				),
			]
			const index = children.indexOf(container)
			if (index >= 0) {
				lb.loadAndOpen(index)
			}
		} else {
			const items = [
				...document.querySelectorAll<HTMLElement>(
					'.pswp-zoom:not([data-pswp-gallery])',
				),
			]
			const index = items.indexOf(container)
			if (index >= 0) {
				standaloneLightbox.loadAndOpen(index)
			}
		}
	})
}
