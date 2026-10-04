import type { HlsJsVideoElement, HlsSource } from '@videojs/html/media/hlsjs-video'

export type HlsSourceOptions = Pick<HlsSource, 'capRenditionToPlayerSize' | 'engine'>

export const VIDEO_ELEMENT_TAGS = ['hlsjs-video', 'video', 'vimeo-video', 'youtube-video'] as const
export type VideoElementTag = (typeof VIDEO_ELEMENT_TAGS)[number]
export const VIDEO_ELEMENT_SELECTOR = VIDEO_ELEMENT_TAGS.join(', ')

/** Validate a serialized media element name. */
export function parseVideoElementTag(value: string | undefined): undefined | VideoElementTag {
	return VIDEO_ELEMENT_TAGS.find((tag) => tag === value)
}

/**
 * Recognize manifests independently of the hosting service, including signed
 * URLs.
 */
export function isHlsSource(src: string): boolean {
	return new URL(src, 'https://local.invalid').pathname.toLowerCase().endsWith('.m3u8')
}

/** Read the server-serialized streaming options. */
export function parseHlsOptions(json: string | undefined): HlsSourceOptions {
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
	if (element.localName === 'hlsjs-video') {
		;(element as HlsJsVideoElement).source = { ...parseHlsOptions(options), src }
	} else if (element.getAttribute('src') !== src) {
		element.setAttribute('src', src)
	}
}

/** Wait for attachment so startup errors reach the player and its error dialog. */
export function setVideoSourceWhenReady(
	element: HTMLElement,
	src: string,
	options?: string,
): () => void {
	const player = element.closest<
		HTMLElement & {
			store: { subscribe: (listener: () => void) => () => void; target: unknown }
		}
	>('video-player')
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
