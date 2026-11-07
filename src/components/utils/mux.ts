import type { Asset } from '@mux/ts/resources/video/assets'
import Mux from '@mux/ts'
// Future services will take a similar shape
// Must export *Config and *GetVideoInfo
import type { VideoInfo } from './video'
import { requestSignal } from './media'

/**
 * Credentials for the Mux Video API. Set via `astro:env` or environment
 * variables.
 */
export type MuxConfig = {
	/** Mux token ID (`MUX_TOKEN_ID`). */
	accessToken: string
	/** Mux token secret (`MUX_TOKEN_SECRET`). */
	secret: string
}

function fallbackMp4Name(renditions: Asset.StaticRenditions): string | undefined {
	// The current API reports readiness per file; the legacy mp4_support option
	// reports it on the collection. Audio-only renditions are not video fallbacks.
	const files = renditions.files ?? []
	let fallback: (typeof files)[number] | undefined
	for (const file of files) {
		if ((file.status ?? renditions.status) !== 'ready' || file.name?.endsWith('.mp4') !== true) {
			continue
		}

		if (fallback === undefined || (file.width ?? 0) > (fallback.width ?? 0)) {
			fallback = file
		}
	}

	return fallback?.name
}

/**
 * Get video information from Mux
 *
 * Video must have a ready static MP4 rendition for fallback support. Supports
 * both the Static Renditions API and the deprecated `mp4_support` option.
 */
export async function muxGetVideoInfo(mediaId: string, config: MuxConfig): Promise<VideoInfo> {
	if (!muxIsValidMediaId(mediaId)) {
		throw new Error(`Mux media lookup by title not implemented. Received invalid id: "${mediaId}"`)
	}

	const {
		video: { assets },
	} = new Mux({ tokenId: config.accessToken, tokenSecret: config.secret })

	const video = await assets.retrieve(mediaId, { signal: requestSignal() })

	const logPrefix = `Mux video with id "${mediaId}"`

	if (video.status !== 'ready') {
		throw new Error(`${logPrefix} is not ready. Try again in a bit.`)
	}

	// For width and height
	const videoTracks = video.tracks ? video.tracks.filter((track) => track.type === 'video') : []

	if (videoTracks.length !== 1) {
		throw new Error(`${logPrefix} does not have exactly one video track. Support TBD.`)
	}

	const videoTrack = videoTracks[0]

	if (!videoTrack) {
		throw new Error(`${logPrefix} does not have a video track. Should be impossible.`)
	}

	const { max_height: height, max_width: width } = videoTrack

	// For mp4 backup
	if (height === undefined || width === undefined) {
		throw new Error(`${logPrefix} does not have a width or height value.`)
	}

	// For HLS URL. A public ID plays without a token; a signed one is listed
	// first just as often.
	const playbackIds = video.playback_ids ?? []
	const playbackId = (
		playbackIds.find((playback) => playback.policy === 'public') ?? playbackIds.at(0)
	)?.id
	if (playbackId === undefined || playbackId === '') {
		throw new Error(`${logPrefix} does not have a playback ID.`)
	}

	// For mp4 backup

	if (video.static_renditions === undefined) {
		throw new Error(
			`${logPrefix} does not have a fallback mp4. You must enable mp4 encoding via the API.`,
		)
	}

	const mp4Name = fallbackMp4Name(video.static_renditions)
	if (mp4Name === undefined) {
		throw new Error(`${logPrefix} does not have a ready fallback mp4 rendition.`)
	}

	// Find captions, if available
	// Mux embeds these in the HLS stream, but still wanted for fallback
	const captionTracks = video.tracks
		? video.tracks.filter((track) => track.type === 'text' && track.text_type === 'subtitles')
		: []

	// eslint-disable-next-line unicorn/no-array-reduce
	const captionsWithUrls = captionTracks.reduce<VideoInfo['captions']>(
		// eslint-disable-next-line ts/naming-convention
		(accumulator, { id, language_code, name }) => {
			if (name !== undefined && id !== undefined && language_code !== undefined) {
				accumulator.push({
					label: name,
					src: `https://stream.mux.com/${playbackId}/text/${id}.vtt`,
					srclang: language_code,
				})
			}

			return accumulator
		},
		[],
	)

	return {
		captions: captionsWithUrls,
		duration: video.duration ?? -1,
		height,
		hlsUrl: `https://stream.mux.com/${playbackId}.m3u8`,
		mp4Url: `https://stream.mux.com/${playbackId}/${mp4Name}`,
		posterUrl: `https://image.mux.com/${playbackId}/thumbnail.png`, // TODO expose time param
		title: undefined, // Mux assets don't have a title field
		width,
	}
}

const ALPHANUMERIC44_REGEX = /^[\da-z]{44}$/iv

/**
 * Check if a string is a valid Mux media ID
 */
export function muxIsValidMediaId(mediaId: string): boolean {
	return ALPHANUMERIC44_REGEX.test(mediaId)
}
