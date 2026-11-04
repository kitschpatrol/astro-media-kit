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
		: await probeImageFile(src)

	if (srcDark !== undefined) {
		const darkMetadata = isImageMetadataObject(srcDark)
			? unwrapImageMetadata(srcDark)
			: await probeImageFile(srcDark)

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
	const filePath = sourceFilePath(src)

	try {
		const { XMP: { Creator: creator, Credit: credit, Label: label } = {} } =
			(await exiftool.readRaw(filePath, { readArgs: ['-g', '-xmp:all'] })) as {
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
	} catch (error) {
		// Credits are optional, so a failed lookup warns once per file and
		// leaves the credit line to the explicit props
		if (!reportedXmpFailures.has(filePath)) {
			reportedXmpFailures.add(filePath)
			console.warn(
				`[astro-media-kit] Could not read XMP credit tags from "${filePath}": ${error instanceof Error ? error.message : String(error)}. Pass credit, creditOrganization, and creditMediaType explicitly to skip the lookup.`,
			)
		}

		return { creator: undefined, credit: undefined, label: undefined }
	}
}

const reportedXmpFailures = new Set<string>()

/**
 * The file to read tags from: the imported file, whose path Astro keeps on the
 * metadata, or else the served file, which a build emits under `dist`.
 */
function sourceFilePath(src: ImageMetadata | string): string {
	return typeof src === 'object' && 'fsPath' in src && typeof src.fsPath === 'string'
		? src.fsPath
		: getAbsoluteFilePath(src, import.meta.env.MODE === 'production')
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

	if (hasStringSrc(src)) {
		return true
	}

	// Astro wraps SVG imports in createSvgComponent in production builds,
	// placing ImageMetadata under .meta instead of at the top level.
	return (
		'meta' in src && typeof src.meta === 'object' && src.meta !== null && hasStringSrc(src.meta)
	)
}

/**
 * Whether `value` carries a string `src`, without reading it: Astro serves
 * imported images through a `src` getter that records a raw reference, which
 * keeps the original file in the build output beside its transforms.
 */
function hasStringSrc(value: unknown): boolean {
	if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
		return false
	}

	const descriptor = Object.getOwnPropertyDescriptor(value, 'src')
	return (
		descriptor !== undefined &&
		(descriptor.get !== undefined || typeof descriptor.value === 'string')
	)
}

/**
 * Extracts a plain ImageMetadata object from a value, unwrapping Astro's SVG
 * component wrapper if necessary. SVG components are functions with metadata
 * properties spread on them — this extracts just the data as a plain object.
 */
export function unwrapImageMetadata(src: ImageMetadata): ImageMetadata {
	// Plain object with .src — already correct
	if (typeof src === 'object' && hasStringSrc(src)) {
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
 * public assets and protocol-relative URLs. Vite filesystem URLs and absolute
 * paths inside the project retain the kit's local-file handling.
 */
export function isImageUrlSource(src: unknown): src is string {
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

/** Probe a file given as a path, naming the path that was tried when it fails. */
async function probeImageFile(source: string): Promise<ImageMetadata> {
	const filePath = getAbsoluteFilePath(source)
	try {
		return await probeImageMetadata(filePath)
	} catch (error) {
		throw new Error(
			`Could not read the image "${source}" at "${filePath}": ${error instanceof Error ? error.message : String(error)}. ` +
				'A path resolves against the working directory. Import the image as a module instead, or pass an absolute path.',
			{ cause: error },
		)
	}
}

function assertLightDarkImageParity(light: ImageMetadata, dark: ImageMetadata): void {
	if (light.format !== dark.format) {
		throw new Error('Dark and light images must have the same format.')
	}

	if (light.width !== dark.width || light.height !== dark.height) {
		throw new Error('Dark and light images must have the same dimensions.')
	}
}
