import { isPlainObject, isUrlInstance } from '@sindresorhus/is'
import nodePath from 'node:path'
import { fileURLToPath } from 'node:url'

type PathLikeInput =
	| string
	| URL
	| {
			src?: string | URL
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
	return nodePath.extname(plainPath)
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
	return nodePath.join(
		nodePath.dirname(plainPath),
		nodePath.basename(plainPath, nodePath.extname(plainPath)),
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

	let pathString = isUrlInstance(pathStringOrUrl) ? fileURLToPath(pathStringOrUrl) : pathStringOrUrl

	// Strip Vite's /@fs/ prefix if present
	if (pathString.startsWith('/@fs/')) {
		pathString = pathString.slice(4) // Remove '/@fs' prefix, keeping the leading '/'
	}

	try {
		// Try to parse string as URL
		const url = new URL(pathString, 'file://')
		return url.pathname
	} catch {
		// Fall back to treating as file path
		return pathString
	}
}

/**
 * Gets the absolute file path from a path or URL, handling special cases like
 * Vite's /@fs/ URLs.
 *
 * @param path - The path or URL to convert to an absolute file path.
 *
 * @returns The absolute file path.
 */
export function getAbsoluteFilePath(path: PathLikeInput, addDistribution = false): string {
	const plainPath = getPlainPath(path)
	return nodePath.join(process.cwd(), addDistribution ? 'dist' : '', stripCwd(plainPath))
}

/**
 * Strips the current working directory from the path if it is present.
 */
export function stripCwd(path: string): string {
	return path.startsWith(process.cwd()) ? path.slice(process.cwd().length) : path
}

/**
 * Resolves aliases like ~/ to the absolute src path. Must be synced with:
 * astro.config.ts, tsconfig.json, and path.ts
 */
export function resolveAliases(path: string): string {
	if (!path.startsWith('~/')) {
		return path
	}

	return nodePath.resolve(process.cwd(), 'src', path.slice(2))
}
