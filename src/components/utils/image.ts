import type { ImageMetadata } from 'astro'
import { exiftool } from 'exiftool-vendored'
import type { DarkLightImageMetadata, ImageMetadataLike } from '../../types'
import { probeImageMetadata } from '../../utilities/image-probe'
import { getAbsoluteFilePath } from '../../utilities/path'
import { tryParseUrl } from './media'

/**
 * Resolves an image source to ImageMetadata, with optional dark mode variant.
 *
 * Accepts either an already-resolved ImageMetadata object or an absolute file
 * path string. When given a string, probes the file for dimensions and format.
 *
 * Consuming projects should prefer passing imported ImageMetadata objects (the
 * standard Astro pattern) rather than string paths.
 *
 * @param src - ImageMetadata object or absolute file path to the image
 * @param srcDark - Optional path or ImageMetadata for the dark theme variant
 *
 * @returns Promise resolving to ImageMetadata or a { dark, light } pair
 */
export async function resolveImageSource(
	src: ImageMetadata | ImageMetadataLike | string,
	srcDark?: ImageMetadata | ImageMetadataLike | string,
): Promise<DarkLightImageMetadata | ImageMetadata> {
	const lightMetadata = isImageMetadataObject(src)
		? unwrapImageMetadata(src)
		: await probeImageMetadata(getAbsoluteFilePath(src))

	if (srcDark !== undefined) {
		const darkMetadata = isImageMetadataObject(srcDark)
			? unwrapImageMetadata(srcDark)
			: await probeImageMetadata(getAbsoluteFilePath(srcDark))

		assertLightDarkImageParity(lightMetadata, darkMetadata)
		return { dark: darkMetadata, light: lightMetadata }
	}

	return lightMetadata
}

/**
 * Extracts metadata credit information from an image's XMP tags.
 *
 * Reads XMP metadata from an image file and extracts creator, credit, and label
 * information.
 *
 * @param src - The image source (ImageMetadata or file path string)
 *
 * @returns Creator, credit, and label from XMP tags
 */
export async function getCreditFromXmpTags(src: ImageMetadata | string): Promise<{
	creator: string | undefined
	credit: string | undefined
	label: string | undefined
}> {
	const isProduction = import.meta.env.MODE === 'production'
	const absoluteSrc = getAbsoluteFilePath(src, isProduction)

	try {
		const { XMP: { Creator: creator, Credit: credit, Label: label } = {} } =
			(await exiftool.readRaw(absoluteSrc, { readArgs: ['-g', '-xmp:all'] })) as {
				// eslint-disable-next-line ts/naming-convention
				XMP?: {
					// eslint-disable-next-line ts/naming-convention
					Creator?: string | string[] | undefined
					// eslint-disable-next-line ts/naming-convention
					Credit?: string | undefined
					// eslint-disable-next-line ts/naming-convention
					Label?: string | undefined
				}
			}

		return { creator: Array.isArray(creator) ? creator[0] : creator, credit, label }
	} catch {
		return { creator: undefined, credit: undefined, label: undefined }
	}
}

/**
 * Checks if the given source is an ImageMetadata object, including Astro's SVG
 * component wrappers which nest metadata under `.meta`.
 */
export function isImageMetadataObject(src: unknown): src is ImageMetadata {
	if (src === null || src === undefined) {
		return false
	}

	if (typeof src !== 'object' && typeof src !== 'function') {
		return false
	}

	if ('src' in src && typeof src.src === 'string') {
		return true
	}

	// Astro wraps SVG imports in createSvgComponent in production builds,
	// placing ImageMetadata under .meta instead of at the top level.
	return (
		'meta' in src &&
		typeof src.meta === 'object' &&
		src.meta !== null &&
		'src' in src.meta &&
		typeof src.meta.src === 'string'
	)
}

/**
 * Extracts a plain ImageMetadata object from a value, unwrapping Astro's SVG
 * component wrapper if necessary. SVG components are functions with metadata
 * properties spread on them — this extracts just the data as a plain object.
 */
export function unwrapImageMetadata(src: ImageMetadata): ImageMetadata {
	// Plain object with .src — already correct
	if (typeof src === 'object' && 'src' in src && typeof src.src === 'string') {
		return src
	}
	// SVG component function: metadata is spread on the function AND available as .meta
	// Extract .meta (a plain object) rather than returning the function

	if ('meta' in src) {
		return (src as unknown as { meta: ImageMetadata }).meta
	}

	// Fallback: extract known properties into a plain object
	const { format, height, src: imgSrc, width } = src
	return { format, height, src: imgSrc, width }
}

/**
 * Checks if the given source is a remote `http(s)` URL string.
 * Protocol-relative `//...` is not treated as remote — Astro's remote image
 * pipeline requires an explicit protocol.
 */
export function isRemoteImageSource(src: unknown): src is string {
	return typeof src === 'string' && tryParseUrl(src) !== undefined
}

/**
 * Recognize URLs for Astro's image pipeline, including site-root paths to
 * public assets. Vite filesystem URLs and absolute paths inside the project
 * retain the kit's local-file handling.
 */
export function isImageUrlSource(src: unknown): boolean {
	return (
		isRemoteImageSource(src) ||
		(typeof src === 'string' &&
			src.startsWith('/') &&
			!src.startsWith('/@fs/') &&
			!src.startsWith(`${process.cwd().replaceAll('\\', '/')}/`))
	)
}

/**
 * Checks if the given source is a { dark, light } image metadata pair.
 */
export function isDarkLightImageMetadata(src: unknown): src is DarkLightImageMetadata {
	if (typeof src !== 'object' || src === null || !('light' in src) || !('dark' in src)) {
		return false
	}

	const candidate = src as Record<string, unknown>
	return isImageMetadataObject(candidate.light) && isImageMetadataObject(candidate.dark)
}

// Helpers

function assertLightDarkImageParity(light: ImageMetadata, dark: ImageMetadata): void {
	if (light.format !== dark.format) {
		throw new Error('Dark and light images must have the same format.')
	}

	if (light.width !== dark.width || light.height !== dark.height) {
		throw new Error('Dark and light images must have the same dimensions.')
	}
}
