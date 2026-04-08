// Future services will take a similar shape
// Must export *Config and *GetVideoInfo
import type { VideoInfo } from './video'

/**
 * Credentials for the Bunny CDN video API. Set via `astro:env` or environment
 * variables.
 */
export type BunnyConfig = {
	/** Bunny API access key (`BUNNY_API_ACCESS_KEY`). */
	apiAccessKey: string
	/**
	 * Bunny CDN pull zone hostname (`BUNNY_HOSTNAME`), e.g.
	 * `'vz-abcdef-123.b-cdn.net'`.
	 */
	hostname: string
	/** Bunny video library ID (`BUNNY_LIBRARY_ID`). */
	libraryId: string
}

type BunnyListVideosResponse = {
	currentPage: number
	items: BunnyGetVideoResponse[]
	itemsPerPage: number
	totalItems: number
}

// GPT-generated type based on
// https://docs.bunny.net/reference/video_getvideo
type BunnyGetVideoResponse = {
	availableResolutions?: string
	averageWatchTime: number
	captions?: Array<{
		label: string
		srclang: string
	}>
	category?: string
	chapters?: Array<{
		end: number
		start: number
		title: string
	}>
	collectionId?: string
	dateUploaded: string
	encodeProgress: number
	framerate: number
	guid?: string
	hasMP4Fallback: boolean
	height: number
	isPublic: boolean
	length: number
	metaTags?: Array<{
		property: string
		value: string
	}>
	moments?: Array<{
		label: string
		timestamp: number
	}>
	rotation?: number
	status:
		| 0 // Created
		| 1 // Uploaded
		| 2 // Processing
		| 3 // Transcoding
		| 4 // Finished
		| 5 // Error
		| 6 // UploadFailed;
	storageSize: number
	thumbnailCount: number
	thumbnailFileName?: string
	title?: string
	totalWatchTime: number
	transcodingMessages: Array<{
		issueCode:
			| 0 // Undefined
			| 1 // StreamLengthsDifference
			| 2 // TranscodingWarnings
			| 3 // IncompatibleResolution
			| 4 // InvalidFramerate
			| 5 // VideoExceededMaxDuration
			| 6 // AudioExceededMaxDuration
			| 7 // OriginalCorrupted;
		level:
			| 0 // Undefined
			| 1 // Information
			| 2 // Warning
			| 3 // Error;
		message: string
		timeStamp: string
		value: string
	}>
	videoLibraryId: number
	views: number
	width: number
}

// https://docs.bunny.net/reference/video_list
async function bunnyApiListVideos(
	libraryId: string,
	search: string,
	apiAccessKey: string,
): Promise<BunnyListVideosResponse> {
	const response = await fetch(
		`https://video.bunnycdn.com/library/${libraryId}/videos?page=1&itemsPerPage=1000&search=${encodeURIComponent(search)}`,
		{
			headers: {
				accept: 'application/json',
				// eslint-disable-next-line ts/naming-convention
				AccessKey: apiAccessKey,
			},
			method: 'GET',
		},
	)

	if (response.status !== 200) {
		throw new Error(
			`Bunny list videos API returned status ${response.status}: "${response.statusText}"`,
		)
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion
	const json = (await response.json()) as BunnyListVideosResponse
	return json
}

// https://docs.bunny.net/reference/video_getvideo
async function bunnyApiGetVideo(
	libraryId: string,
	mediaId: string,
	apiAccessKey: string,
): Promise<BunnyGetVideoResponse> {
	const response = await fetch(
		`https://video.bunnycdn.com/library/${libraryId}/videos/${mediaId}`,
		{
			headers: {
				accept: 'application/json',
				// eslint-disable-next-line ts/naming-convention
				AccessKey: apiAccessKey,
			},
			method: 'GET',
		},
	)

	if (response.status !== 200) {
		throw new Error(
			`Bunny get video API returned status ${response.status}: "${response.statusText}"`,
		)
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion
	const json = (await response.json()) as BunnyGetVideoResponse
	return json
}

/**
 * Get video info from Bunny CDN by media id or title
 */
export async function bunnyGetVideoInfo(
	mediaIdOrTitle: string,
	config: BunnyConfig,
): Promise<VideoInfo> {
	let videoInfo: BunnyGetVideoResponse

	// Infer media id vs. title from shape of the input
	if (bunnyIsValidMediaId(mediaIdOrTitle)) {
		// Direct lookup by media id
		videoInfo = await bunnyApiGetVideo(config.libraryId, mediaIdOrTitle, config.apiAccessKey)
	} else {
		// Search for the video
		const listVideoResponse = await bunnyApiListVideos(
			config.libraryId,
			mediaIdOrTitle,
			config.apiAccessKey,
		)

		if (listVideoResponse.items[0] === undefined) {
			throw new Error(`No Bunny video found with id or title "${mediaIdOrTitle}"`)
		}

		videoInfo = listVideoResponse.items[0]
	}

	const {
		availableResolutions,
		captions = [],
		guid,
		hasMP4Fallback: hasMp4Fallback,
		height,
		length: duration,
		status,
		thumbnailFileName,
		title,
		width,
	} = videoInfo

	const logPrefix = title
		? `Bunny video "${title}" with id "${guid}"`
		: `Bunny video with id "${mediaIdOrTitle}"`

	if (status !== 4) {
		throw new Error(`${logPrefix} is not ready. Try again in a bit.`)
	}

	// Find fallback mp4 res, 720 or lower
	if (!hasMp4Fallback) {
		throw new Error(
			`${logPrefix} does not have a fallback mp4. You must enable mp4 fallback encoding in the Bunny control panel.`,
		)
	}

	if (!availableResolutions) {
		throw new Error(`${logPrefix} has no available resolutions. This should be impossible.`)
	}

	const matches = availableResolutions.match(/\d+/g)
	if (!matches || matches.length === 0) {
		throw new Error(`${logPrefix} had un-parsable available resolutions: ${availableResolutions}`)
	}

	const resolutions = matches.map((number_) => Number.parseInt(number_, 10))
	// eslint-disable-next-line unicorn/no-array-reduce
	const fallbackResolution = resolutions.reduce((max, current) => {
		if (current <= 720 && current > max) {
			return current
		}

		return max
	}, Number.NEGATIVE_INFINITY)

	// Find captions, if available
	const captionsWithUrls = captions.map((caption) => ({
		label: caption.label,
		src: `https://${config.hostname}/${guid}/captions/${caption.srclang}.vtt`,
		srclang: caption.srclang,
	}))

	// URL format documentation:
	// https://docs.bunny.net/docs/stream-video-storage-structure

	return {
		captions: captionsWithUrls,
		duration,
		height,
		hlsUrl: `https://${config.hostname}/${guid}/playlist.m3u8`,
		mp4Url: `https://${config.hostname}/${guid}/play_${fallbackResolution}p.mp4`,
		posterUrl: `https://${config.hostname}/${guid}/${thumbnailFileName}`,
		title,
		width,
	}
}

const UUID_REGEX = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

/**
 * Check if a string is a valid Bunny CDN media id
 */
export function bunnyIsValidMediaId(mediaId: string): boolean {
	return UUID_REGEX.test(mediaId)
}
