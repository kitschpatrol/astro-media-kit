import type { ImageMetadata } from 'astro'
import { exiftool } from 'exiftool-vendored'
import type { DarkLightImageMetadata, ImageMetadataLike } from '../../types'
import { getAbsoluteFilePath } from '../../utilities/path'
import { tryParseUrl } from './media'

/**
 * Resolves an image source to ImageMetadata, with optional dark mode variant.
 *
 * Unwraps Astro's SVG component form, and pairs a dark counterpart with the
 * light source once the two are known to share a format and dimensions.
 *
 * @param src - ImageMetadata for the image
 * @param srcDark - Optional ImageMetadata for the dark theme variant
 *
 * @returns ImageMetadata or a { dark, light } pair
 */
export function resolveImageSource(
	src: ImageMetadata | ImageMetadataLike,
	srcDark?: ImageMetadata | ImageMetadataLike,
): DarkLightImageMetadata | ImageMetadata {
	const lightMetadata = unwrapImageMetadata(src)
	if (srcDark === undefined) {
		return lightMetadata
	}

	const darkMetadata = unwrapImageMetadata(srcDark)
	assertLightDarkImageParity(lightMetadata, darkMetadata)
	return { dark: darkMetadata, light: lightMetadata }
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
 * Checks if the given source is an ImageMetadata object, or an SVG component,
 * which is a function with the metadata spread on it.
 */
export function isImageMetadataObject(src: unknown): src is ImageMetadata {
	if (src === null || (typeof src !== 'object' && typeof src !== 'function')) {
		return false
	}

	// Astro serves imported images through a `src` getter that records a raw
	// reference, which keeps the original file in the build output. Look for
	// the getter without reading it.
	const descriptor = Object.getOwnPropertyDescriptor(src, 'src')
	return (
		descriptor !== undefined &&
		(descriptor.get !== undefined || typeof descriptor.value === 'string')
	)
}

/**
 * The metadata of a source as a plain object: an SVG component is a function
 * with the metadata spread on it, which the path helpers cannot take. A plain
 * object passes through as it is, since copying it would read its tracked `src`
 * getter. A value without a string `src` is not image metadata and is refused.
 */
export function unwrapImageMetadata(src: ImageMetadata | ImageMetadataLike): ImageMetadata {
	if (!isImageMetadataObject(src)) {
		throw new TypeError(
			'An image source must carry a string `src`. Import the image and pass its metadata.',
		)
	}

	if (typeof src === 'object') {
		return src
	}

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
 * Recognize URLs for Astro's image pipeline: remote `http(s)` URLs, site-root
 * paths to public assets, and protocol-relative URLs.
 */
export function isImageUrlSource(src: unknown): boolean {
	return isRemoteImageSource(src) || (typeof src === 'string' && src.startsWith('/'))
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

function assertLightDarkImageParity(light: ImageMetadata, dark: ImageMetadata): void {
	if (light.format !== dark.format) {
		throw new Error('Dark and light images must have the same format.')
	}

	if (light.width !== dark.width || light.height !== dark.height) {
		throw new Error('Dark and light images must have the same dimensions.')
	}
}
