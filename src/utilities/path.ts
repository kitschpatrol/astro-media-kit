import { isPlainObject, isUrlInstance } from '@sindresorhus/is'
import nodePath from 'node:path'

type PathLikeInput =
	| string
	| URL
	| {
			src?: string | URL
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

	// For URL instances, use pathname directly. fileURLToPath() throws on
	// Windows for file URLs without a drive letter (e.g. file:///images/x.png).
	let pathString = isUrlInstance(pathStringOrUrl)
		? pathStringOrUrl.pathname
		: toPosix(pathStringOrUrl)

	// Strip Vite's /@fs/ prefix if present
	if (pathString.startsWith('/@fs/')) {
		pathString = pathString.slice(4) // Remove '/@fs' prefix, keeping the leading '/'
	}

	try {
		// Try to parse string as URL — primarily to strip query strings/hashes
		// that Vite may append (e.g. ?import, ?url). Reject results whose
		// protocol isn't file:, since URL parsing treats Windows drive letters
		// (e.g. D:/foo) as a custom scheme and would silently drop the drive.
		const url = new URL(pathString, 'file://')
		if (url.protocol === 'file:') {
			return url.pathname
		}

		return pathString
	} catch {
		// Fall back to treating as file path
		return pathString
	}
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
export function getAbsoluteFilePath(path: PathLikeInput, addDistribution = false): string {
	const plainPath = getPlainPath(path)
	return nodePath.posix.join(posixCwd(), addDistribution ? 'dist' : '', stripCwd(plainPath))
}

/**
 * Strips the current working directory from the path if it is present.
 */
export function stripCwd(path: string): string {
	const cwd = posixCwd()
	const normalized = toPosix(path)
	return normalized.startsWith(cwd) ? normalized.slice(cwd.length) : normalized
}

/**
 * Resolves aliases like ~/ to the absolute src path. Must be synced with:
 * astro.config.ts, tsconfig.json, and path.ts
 */
export function resolveAliases(path: string): string {
	if (!path.startsWith('~/')) {
		return path
	}

	return toPosix(nodePath.resolve(process.cwd(), 'src', path.slice(2)))
}
