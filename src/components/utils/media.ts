/** Media file extensions recognized as directly playable by browsers. */
const DIRECT_MEDIA_EXTENSIONS = new Set([
	'.flac',
	'.m3u8',
	'.m4a',
	'.mkv',
	'.mov',
	'.mp3',
	'.mp4',
	'.ogg',
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

/** Try to parse a string as an HTTP(S) URL. Returns undefined for non-URLs. */
export function tryParseUrl(src: string): undefined | URL {
	if (!src.startsWith('http://') && !src.startsWith('https://')) {
		return undefined
	}

	try {
		return new URL(src)
	} catch {
		return undefined
	}
}
