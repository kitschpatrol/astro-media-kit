import { isPlainObject, isUrlInstance } from '@sindresorhus/is'
import nodePath from 'node:path'

const WINDOWS_DRIVE_PREFIX = /^\/[a-z]:\//iv
const FILE_OR_HTTP_URL = /^(?:file|https?):\/\//iv
const QUERY_OR_HASH = /[?#]/v

type PathLikeInput =
	| string
	| URL
	| {
			src?: string | URL
	  }

function decodeUrlPath(path: string): string {
	try {
		return decodeURIComponent(path)
	} catch {
		// A literal percent sign is also a valid filesystem filename.
		return path
	}
}

function urlPath(url: URL): string {
	const path = decodeUrlPath(url.pathname)
	return url.protocol === 'file:' && WINDOWS_DRIVE_PREFIX.test(path) ? path.slice(1) : path
}

function toPosix(path: string): string {
	return path.replaceAll('\\', '/')
}

function posixCwd(): string {
	return toPosix(process.cwd())
}

/**
 * Gets the file extension from a path or URL. Returns an empty string if the
 * path or URL is not a valid file path or URL.
 *
 * @param path - The path to get the file extension from.
 *
 * @returns The file extension.
 */
export function getFileExtension(path: PathLikeInput): string {
	const plainPath = getPlainPath(path)
	return nodePath.posix.extname(plainPath)
}

/**
 * Gets the path without the extension from a path or URL.
 *
 * @param path - The path to get the path without the extension from.
 *
 * @returns The path without the extension.
 */
export function getPathWithoutExtension(path: PathLikeInput): string {
	const plainPath = getPlainPath(path)
	return nodePath.posix.join(
		nodePath.posix.dirname(plainPath),
		nodePath.posix.basename(plainPath, nodePath.posix.extname(plainPath)),
	)
}

/**
 * Removes Vite's /@fs/ prefix if present, any URL prefix, and any query params.
 * Leaves relative / absolute/ leading / trailing slashes as they are.
 *
 * @param path - The path, URL, or object to get the plain path from.
 *
 * @returns The plain path string.
 */
function getPlainPath(path: PathLikeInput): string {
	const pathStringOrUrl =
		isPlainObject(path) && 'src' in path ? path.src : isPlainObject(path) ? undefined : path
	if (pathStringOrUrl === undefined) {
		throw new TypeError('Cannot derive absolute file path from provided input.')
	}

	if (isUrlInstance(pathStringOrUrl)) {
		return urlPath(pathStringOrUrl)
	}

	let pathString = toPosix(pathStringOrUrl)
	if (pathString.startsWith('/@fs/')) {
		pathString = pathString.slice(4)
		// Vite prefixes Windows drive paths with /@fs/ as well.
		if (WINDOWS_DRIVE_PREFIX.test(pathString)) {
			pathString = pathString.slice(1)
		}
	}

	// Only parse actual URLs. Parsing plain filenames as URLs percent-encodes
	// spaces and mistakes Windows drive letters for URL schemes.
	return FILE_OR_HTTP_URL.test(pathString)
		? urlPath(new URL(pathString))
		: pathString.split(QUERY_OR_HASH, 1)[0]!
}

/**
 * Gets the absolute file path from a path or URL, handling special cases like
 * Vite's /@fs/ URLs. Always returns a POSIX-style path (forward slashes) for
 * cross-platform consistency. Node's fs APIs accept forward slashes on
 * Windows.
 *
 * @param path - The path or URL to convert to an absolute file path.
 *
 * @returns The absolute file path.
 */
export function getAbsoluteFilePath(path: PathLikeInput, shouldAddDistribution = false): string {
	const plainPath = getPlainPath(path)
	return nodePath.posix.join(posixCwd(), shouldAddDistribution ? 'dist' : '', stripCwd(plainPath))
}

/**
 * Gets the absolute path of a file in Astro's `public/` directory from its
 * site-root-relative URL path (e.g. `/videos/intro.mp4`). Assumes the default
 * `publicDir`, resolved against the current working directory like
 * `getAbsoluteFilePath`.
 *
 * @param path - The site-root-relative path of the public file.
 *
 * @returns The absolute file path.
 */
export function getPublicFilePath(path: string): string {
	return nodePath.posix.join(posixCwd(), 'public', decodeUrlPath(getPlainPath(path)))
}

/**
 * Strips the current working directory from the path if it is present.
 */
export function stripCwd(path: string): string {
	const cwd = posixCwd()
	const normalized = toPosix(path)
	return normalized === cwd || normalized.startsWith(`${cwd}/`)
		? normalized.slice(cwd.length)
		: normalized
}

/**
 * Resolves aliases like ~/ to the absolute src path. Must be synced with:
 * astro.config.ts, tsconfig.json, and path.ts
 */
export function resolveAliases(path: string): string {
	return path.startsWith('~/')
		? toPosix(nodePath.resolve(process.cwd(), 'src', path.slice(2)))
		: path
}
