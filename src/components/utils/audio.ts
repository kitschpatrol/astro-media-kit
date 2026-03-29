import { isDirectMediaUrl, tryParseUrl } from './media'

export type AudioService = 'local' | 'oembed' | 'soundcloud'

/** SoundCloud track IDs are numeric. */
const SOUNDCLOUD_ID_RE = /^\d+$/

/** SoundCloud track IDs are numeric-only, variable length. */
export function soundcloudIsValidMediaId(mediaId: string): boolean {
	return SOUNDCLOUD_ID_RE.test(mediaId)
}

const SOUNDCLOUD_HOSTS = new Set(['m.soundcloud.com', 'soundcloud.com', 'www.soundcloud.com'])

export type ResolvedAudioSource = {
	identifier: string
	service: AudioService
}

/**
 * Resolves a `src` string into an audio service type and identifier.
 *
 * Accepts URLs (SoundCloud, direct media files, or generic pages for oEmbed),
 * raw SoundCloud track IDs (numeric), or local file paths.
 *
 * When `service` is explicitly provided, it overrides inference.
 */
export function resolveAudioSource(src: string, service?: AudioService): ResolvedAudioSource {
	const url = tryParseUrl(src)

	if (url) {
		// SoundCloud URL — pass the full URL through (widget accepts it)
		if (SOUNDCLOUD_HOSTS.has(url.hostname.toLowerCase())) {
			return { identifier: src, service: service ?? 'soundcloud' }
		}

		// Direct media file URL → local
		if (isDirectMediaUrl(url)) {
			return { identifier: src, service: service ?? 'local' }
		}

		// Unknown page URL → oEmbed discovery (Spotify, Mixcloud, etc.)
		return { identifier: src, service: service ?? 'oembed' }
	}

	// Not a URL — try ID pattern matching
	if (soundcloudIsValidMediaId(src)) return { identifier: src, service: service ?? 'soundcloud' }

	// Assume local file path
	return { identifier: src, service: service ?? 'local' }
}

/**
 * Build the SoundCloud iframe embed URL.
 * Accepts either a numeric track ID or a full SoundCloud URL.
 */
export function buildSoundCloudEmbedUrl(
	trackIdOrUrl: string,
	options: { autoPlay: boolean },
): string {
	const trackUrl = trackIdOrUrl.startsWith('http')
		? trackIdOrUrl
		: `https://api.soundcloud.com/tracks/${trackIdOrUrl}`

	/* eslint-disable ts/naming-convention -- SoundCloud embed API parameter names */
	const params = new URLSearchParams({
		auto_play: String(options.autoPlay),
		hide_related: 'false',
		show_comments: 'false',
		show_reposts: 'false',
		show_teaser: 'false',
		show_user: 'true',
		url: trackUrl,
	})
	/* eslint-enable ts/naming-convention */

	return `https://w.soundcloud.com/player/?${params.toString()}`
}
