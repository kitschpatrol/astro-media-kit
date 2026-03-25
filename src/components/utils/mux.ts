// eslint-disable-next-line import/no-named-as-default
import Mux from '@mux/mux-node'
// Future services will take a similar shape
// Must export *Config and *GetVideoInfo
import type { VideoInfo } from './video'

export type MuxConfig = {
	accessToken: string
	secret: string
}

/**
 * Get video information from Mux
 *
 * Video must have `"mp4_support": "standard"` for fallback mp4 support
 * See https://docs.mux.com/api-reference#video/operation/update-asset-mp4-support
 */
export async function muxGetVideoInfo(mediaId: string, config: MuxConfig): Promise<VideoInfo> {
	if (!muxIsValidMediaId(mediaId)) {
		throw new Error(`Mux media lookup by title not implemented. Received invalid id: "${mediaId}"`)
	}

	const {
		video: { assets },
	} = new Mux({ tokenId: config.accessToken, tokenSecret: config.secret })

	const video = await assets.retrieve(mediaId)

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

	// For HLS URL
	const playbackId = video.playback_ids?.at(0)?.id
	if (!playbackId) {
		throw new Error(`${logPrefix} does not have a playback ID.`)
	}

	// For mp4 backup

	if (video.static_renditions === undefined) {
		throw new Error(
			`${logPrefix} does not have a fallback mp4. You must enable mp4 encoding via the API.`,
		)
	}

	if (video.static_renditions.status !== 'ready') {
		throw new Error(`${logPrefix} fallback mp4 is not yet ready. Try again in a bit.`)
	}

	if (video.static_renditions.files === undefined) {
		throw new Error(`${logPrefix} fallback mp4 is not yet ready. Try again in a bit.`)
	}

	// Get highest quality fallback
	// eslint-disable-next-line unicorn/no-array-reduce
	const { name: mp4Name } = video.static_renditions.files.reduce((previous, current) =>
		previous.width !== undefined && current.width !== undefined
			? previous.width > current.width
				? previous
				: current
			: previous,
	)

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

/**
 * Check if a string is a valid Mux media ID
 */
export function muxIsValidMediaId(mediaId: string): boolean {
	return /^[\da-z]{44}$/i.test(mediaId)
}
