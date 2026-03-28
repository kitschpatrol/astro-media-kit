export type AudioService = 'local' | 'soundcloud'

/** SoundCloud track IDs are numeric. */
const SOUNDCLOUD_ID_RE = /^\d+$/

/** SoundCloud track IDs are numeric-only, variable length. */
export function soundcloudIsValidMediaId(mediaId: string): boolean {
	return SOUNDCLOUD_ID_RE.test(mediaId)
}

/** Infer the audio service from a media ID. Currently only SoundCloud (numeric) is supported. */
export function inferAudioServiceFromMediaId(mediaId: string): AudioService {
	if (soundcloudIsValidMediaId(mediaId)) return 'soundcloud'
	throw new Error(`Could not infer audio service from media id "${mediaId}"`)
}

/** Build the SoundCloud iframe embed URL for a given track ID. */
export function buildSoundCloudEmbedUrl(trackId: string, options: { autoPlay: boolean }): string {
	/* eslint-disable ts/naming-convention -- SoundCloud embed API parameter names */
	const params = new URLSearchParams({
		auto_play: String(options.autoPlay),
		hide_related: 'false',
		show_comments: 'false',
		show_reposts: 'false',
		show_teaser: 'false',
		show_user: 'true',
		url: `https://api.soundcloud.com/tracks/${trackId}`,
	})
	/* eslint-enable ts/naming-convention */

	return `https://w.soundcloud.com/player/?${params.toString()}`
}
