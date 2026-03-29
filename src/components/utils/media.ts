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

/** Returns true if the URL pathname ends with a known media file extension. */
export function isDirectMediaUrl(url: URL): boolean {
	const dot = url.pathname.lastIndexOf('.')
	if (dot === -1) return false
	return DIRECT_MEDIA_EXTENSIONS.has(url.pathname.slice(dot).toLowerCase())
}

/** Returns true if the string looks like a local file path (starts with `/`, `./`, `../`, or has a media extension). */
export function isLocalPath(src: string): boolean {
	if (src.startsWith('/') || src.startsWith('./') || src.startsWith('../')) return true
	const dot = src.lastIndexOf('.')
	if (dot === -1) return false
	return DIRECT_MEDIA_EXTENSIONS.has(src.slice(dot).toLowerCase())
}

/** Try to parse a string as an HTTP(S) URL. Returns undefined for non-URLs. */
export function tryParseUrl(src: string): undefined | URL {
	if (!src.startsWith('http://') && !src.startsWith('https://')) return undefined
	try {
		return new URL(src)
	} catch {
		return undefined
	}
}
