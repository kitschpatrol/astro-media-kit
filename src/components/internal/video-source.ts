import type { HlsJsVideoElement, HlsSource } from '@videojs/html/media/hlsjs-video'
import type { VimeoVideoElement } from '@videojs/html/media/vimeo-video'

export type HlsSourceOptions = Pick<HlsSource, 'capRenditionToPlayerSize' | 'engine'>

const VIDEO_ELEMENT_TAGS = ['hlsjs-video', 'video', 'vimeo-video', 'youtube-video'] as const
export type VideoElementTag = (typeof VIDEO_ELEMENT_TAGS)[number]
/**
 * The kit's media that still waits for its source in `data-src`: only inside a
 * wrapper the kit rendered, since a page's own lazy media uses that attribute
 * too.
 */
export const PENDING_MEDIA_SELECTOR = ['audio', ...VIDEO_ELEMENT_TAGS]
	.map((tag) => `.amk ${tag}[data-src]`)
	.join(', ')

/**
 * Recognize manifests independently of the hosting service, including signed
 * URLs.
 */
export function isHlsSource(src: string): boolean {
	return new URL(src, 'https://local.invalid').pathname.toLowerCase().endsWith('.m3u8')
}

/** Read the server-serialized streaming options. */
function parseHlsOptions(json: string | undefined): HlsSourceOptions {
	if (json === undefined || json === '') {
		return {}
	}

	try {
		const parsed: unknown = JSON.parse(json)
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {}
	} catch {
		console.warn('[astro-media-kit] Failed to parse HLS options')
		return {}
	}
}

/** Configure the engine once, with its options included in the initial source. */
export function setVideoSource(element: HTMLElement, src: string, options?: string): void {
	if (element.localName === 'vimeo-video') {
		configureVimeoMute(element as VimeoVideoElement)
	}

	if (element.localName === 'hlsjs-video') {
		;(element as HlsJsVideoElement).source = { ...parseHlsOptions(options), src }
	} else if (element.getAttribute('src') !== src) {
		element.setAttribute('src', src)
	}
}

/**
 * Video.js 10.2 reflects Vimeo's live `muted` property through the content
 * attribute. If Vimeo reports a different state, assigning the existing
 * attribute value does nothing and the mute command never reaches the adapter.
 * Forward runtime mute directly, keeping the attribute as the startup default,
 * like native media. The adapter also needs that default before building its
 * URL.
 */
function configureVimeoMute(element: VimeoVideoElement): void {
	const { adapter } = element
	adapter.defaultMuted = element.defaultMuted
	if (Object.hasOwn(element, 'muted')) {
		return
	}

	Object.defineProperty(element, 'muted', {
		configurable: true,
		get: () => adapter.muted,
		set(value: boolean) {
			adapter.muted = value
		},
	})
}

/** Wait for attachment so startup errors reach the player and its error dialog. */
export function setMediaSourceWhenReady(
	element: HTMLElement,
	src: string,
	options?: string,
): () => void {
	const player = element.closest<
		HTMLElement & {
			store: { subscribe: (listener: () => void) => () => void; target: unknown }
		}
	>('audio-player, video-player')
	if (!player || Boolean(player.store.target)) {
		setVideoSource(element, src, options)
		return () => {
			/* Source was assigned synchronously; nothing to cancel. */
		}
	}

	const unsubscribe = player.store.subscribe(() => {
		if (player.store.target === undefined || player.store.target === null) {
			return
		}

		unsubscribe()
		setVideoSource(element, src, options)
	})
	return unsubscribe
}
