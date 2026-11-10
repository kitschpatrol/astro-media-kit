/** Media file extensions recognized as directly playable by browsers. */
const DIRECT_MEDIA_EXTENSIONS = new Set([
	'.aac',
	'.flac',
	'.m3u8',
	'.m4a',
	'.m4v',
	'.mkv',
	'.mov',
	'.mp3',
	'.mp4',
	'.oga',
	'.ogg',
	'.ogv',
	'.opus',
	'.wav',
	'.webm',
])

/** Image file extensions the image pipeline takes. */
const IMAGE_EXTENSIONS = new Set([
	'.avif',
	'.gif',
	'.heic',
	'.heif',
	'.jpeg',
	'.jpg',
	'.png',
	'.svg',
	'.tif',
	'.tiff',
	'.webp',
])

/** Where a path or URL's query or fragment starts. */
const QUERY_PATTERN = /[#?]/v
const HTTP_URL_PATTERN = /^https?:\/\//iv

/** Returns true if the path or URL names a file with an image extension. */
export function hasImageExtension(src: string): boolean {
	return IMAGE_EXTENSIONS.has(extensionOf(src))
}

/** Returns true if the path or URL names a file with a media extension. */
export function hasMediaExtension(src: string): boolean {
	return DIRECT_MEDIA_EXTENSIONS.has(extensionOf(src))
}

/** Returns true if the URL pathname ends with a known media file extension. */
export function isDirectMediaUrl(url: URL): boolean {
	return hasMediaExtension(url.pathname)
}

/**
 * Returns true if the string looks like a local file path (starts with `/`,
 * `./`, `../`, or has a media extension).
 */
export function isLocalPath(src: string): boolean {
	return (
		src.startsWith('/') || src.startsWith('./') || src.startsWith('../') || hasMediaExtension(src)
	)
}

/** The lowercased extension of a path or URL, dot included, or an empty string. */
function extensionOf(src: string): string {
	const path = src.split(QUERY_PATTERN, 1)[0] ?? ''
	const dot = path.lastIndexOf('.')
	return dot === -1 ? '' : path.slice(dot).toLowerCase()
}

/**
 * The `crossorigin` attribute for a media element: `anonymous` for a file on
 * the page's own origin, and for one with caption tracks, which another origin
 * has to allow anyway. A plain request keeps a file on another origin playable
 * without that origin's permission.
 */
export function mediaCrossOrigin(src: string, hasCaptions = false): 'anonymous' | undefined {
	const isOnAnotherOrigin = tryParseUrl(src) !== undefined || src.startsWith('//')
	return hasCaptions || !isOnAnotherOrigin ? 'anonymous' : undefined
}

/**
 * The signal for a metadata or oEmbed request at build time: a provider that
 * never answers must not stall the build.
 */
export function requestSignal(): AbortSignal {
	return AbortSignal.timeout(15_000)
}

/**
 * A time in seconds as a player shows it, such as `1:05` or `1:05:30`, in the
 * form Video.js gives its own time displays, so that a time drawn into the page
 * reads the same once the player takes over. `guide`, usually the duration,
 * decides whether hours show and minutes are padded, which keeps the current
 * time and the duration alike.
 */
export function formatMediaTime(seconds: number, guide = seconds): string {
	if (!Number.isFinite(seconds)) {
		return '0:00'
	}

	const total = Math.floor(Math.abs(seconds))
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const guideSeconds = Number.isFinite(guide) ? Math.abs(guide) : 0
	const rest = padded(total % 60)
	if (hours > 0 || guideSeconds >= 3600) {
		return `${hours}:${padded(minutes)}:${rest}`
	}

	const hasPaddedMinutes = Math.floor((guideSeconds / 60) % 60) >= 10
	return `${hasPaddedMinutes ? padded(minutes) : minutes}:${rest}`
}

function padded(value: number): string {
	return String(value).padStart(2, '0')
}

/** Try to parse a string as an HTTP(S) URL. Returns undefined for non-URLs. */
export function tryParseUrl(src: string): undefined | URL {
	if (!HTTP_URL_PATTERN.test(src)) {
		return undefined
	}

	try {
		return new URL(src)
	} catch {
		return undefined
	}
}
