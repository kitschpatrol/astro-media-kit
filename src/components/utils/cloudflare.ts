/* eslint-disable ts/no-restricted-types */
// Future services will take a similar shape
// Must export *Config and *GetVideoInfo
import type { VideoInfo } from './video'

/**
 * Credentials for the Cloudflare Stream API. Set via `astro:env` or environment
 * variables.
 */
export type CloudflareConfig = {
	/** Cloudflare account ID (`CLOUDFLARE_STREAM_ACCOUNT_ID`). */
	accountId: string
	/** Cloudflare Stream API token (`CLOUDFLARE_STREAM_API_TOKEN`). */
	apiToken: string
}

// GPT-generated type based on
// Imperfect
// https://developers.cloudflare.com/api/operations/stream-videos-retrieve-video-details
type CloudflareGetVideoResponse = {
	allowedOrigins: string[] // Lists the origins allowed to display the video, use * for wildcard subdomains
	clippedFrom: unknown // The media item from which this video was clipped (structure unknown), null if not clipped
	created: string // The date and time the media item was created, in <date-time> format
	creator: null | string // A user-defined identifier for the media creator, max 64 characters
	duration: number // The duration of the video in seconds, -1 means unknown
	input: {
		width: number // The width of the source video in pixels
		height: number // The height of the source video in pixels
	}
	maxDurationSeconds: null | number
	maxSizeBytes: null | number // The size of the media item in bytes
	meta: {
		filename?: string
		filetype?: string
		name?: string
		relativePath?: string
		type?: string
	}
	modified: string // The date and time the media item was created, in <date-time> format
	playback: {
		dash?: string // DASH Media Presentation Description for the video
		hls?: string // The HLS manifest for the video
	}
	preview?: string // The video's preview page URI, omitted until encoding is complete
	publicDetails: {
		// eslint-disable-next-line ts/naming-convention
		channel_link: string
		logo: string
		// eslint-disable-next-line ts/naming-convention
		share_link: string
		title: string
	}
	readyToStream: boolean // Indicates whether the video is playable
	readyToStreamAt?: string // The time at which the video became playable, in <date-time> format
	requireSignedURLs: boolean // Indicates if the video requires a signed token to view
	scheduledDeletion: null | string // The date and time for scheduled video deletion, in <date-time> format
	size: number // The size of the media item in bytes
	status: {
		errorReasonCode?: string // Specifies why the video failed to encode, empty if not in error state
		errorReasonText?: string // Human-readable error message, empty if not in error state
		pctComplete?: string // Indicates the size of the entire upload in bytes
		state: 'downloading' | 'error' | 'inprogress' | 'pendingupload' | 'queued' | 'ready' // The processing status for the video
	}
	thumbnail?: string // The media item's thumbnail URI, omitted until encoding is complete
	thumbnailTimestampPct?: number // Timestamp for thumbnail image as a percentage of the video's duration, value between 0 and 1
	uid: string // A unique identifier for a media item, max 32 characters
	uploaded: string // The date and time the media item was uploaded, in <date-time> format
	uploadExpiry: string // The date and time when the video upload URL expires, in <date-time> format
	watermark: null | {
		created: string // The date and time a watermark profile was created, in <date-time> format
		downloadedFrom?: string // The source URL for a downloaded image, null if directly uploaded
		height: number // The height of the image in pixels
		name: string // A short description of the watermark profile
		opacity: number // The translucency of the image, value between 0.0 and 1.0
		padding: number // The whitespace between the edges of the video and the image, value between 0.0 and 1.0
		position: string // The location of the image, valid positions include upperRight, upperLeft, lowerLeft, lowerRight, center
		scale: number // The size of the image relative to the video, value between 0.0 and 1.0
		size: number // The size of the image in bytes
		uid: string // The unique identifier for a watermark profile, max 32 characters
		width: number // The width of the image in pixels
	}
}

async function cloudflareApiGetVideo(
	accountId: string,
	mediaId: string,
	apiToken: string,
): Promise<CloudflareGetVideoResponse> {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${mediaId}`,
		{
			headers: {
				// eslint-disable-next-line ts/naming-convention
				Accept: 'application/json',
				// eslint-disable-next-line ts/naming-convention
				Authorization: `Bearer ${apiToken}`,
			},
			method: 'GET',
		},
	)

	if (response.status !== 200) {
		throw new Error(`Cloudflare API returned status ${response.status}: "${response.statusText}"`)
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion
	const json = (await response.json()) as { result: CloudflareGetVideoResponse }
	return json.result
}

/**
 * Get video info from Cloudflare Stream
 */
export async function cloudflareGetVideoInfo(
	mediaId: string,
	config: CloudflareConfig,
): Promise<VideoInfo> {
	if (!cloudflareIsValidMediaId(mediaId)) {
		throw new Error(
			`Cloudflare media lookup by title not implemented. Received invalid id: "${mediaId}"`,
		)
	}

	const videoInfo = await cloudflareApiGetVideo(config.accountId, mediaId, config.apiToken)

	const logPrefix = videoInfo.meta.name
		? `Cloudflare video "${videoInfo.meta.name}" with id "${mediaId}"`
		: `Cloudflare video with id "${mediaId}"`

	if (!videoInfo.readyToStream || !(videoInfo.status.state === 'ready')) {
		throw new Error(`${logPrefix} is not ready to stream. Try again in a bit.`)
	}

	const hlsUrl = videoInfo.playback.hls

	if (hlsUrl === undefined) {
		throw new Error(`${logPrefix} does not have an HLS URL.`)
	}

	const posterUrl = videoInfo.thumbnail

	if (posterUrl === undefined) {
		throw new Error(`${logPrefix} does not have a thumbnail.`)
	}

	// Generate fallback mp4 link, not available via API
	// https://community.cloudflare.com/t/include-download-mp4-link-in-api-request-please/539413/8
	const mp4Url = `${hlsUrl.replace('manifest/video.m3u8', '')}/downloads/default.mp4`

	// Find captions, if available
	// URL is like this but doesn't work unless the url is signed, which won't be possible AOT
	// https://customer-rtmeeqsartjwt6p8.cloudflarestream.com/81841bee83618bdde9278ab586e3568b/text/en.vtt

	return {
		captions: [], // TODO unsupported — signed URLs required for VTT access
		duration: videoInfo.duration,
		height: videoInfo.input.height,
		hlsUrl,
		mp4Url,
		posterUrl,
		title: videoInfo.meta.name ?? videoInfo.publicDetails.title,
		width: videoInfo.input.width,
	}
}

const HEX32_REGEX = /^[\da-f]{32}$/i

/**
 * Check if a string is a valid Cloudflare media ID
 */
export function cloudflareIsValidMediaId(mediaId: string): boolean {
	return HEX32_REGEX.test(mediaId)
}
