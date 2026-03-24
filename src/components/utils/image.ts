import type { ImageMetadata } from 'astro'
import { exiftool } from 'exiftool-vendored'
import { parseHTML } from 'linkedom'
import type { DarkLightImageMetadata } from '../../types'
import { probeImageMetadata } from '../../utilities/image-probe'
import { getAbsoluteFilePath } from '../../utilities/path'

/**
 * Resolves an image source to ImageMetadata, with optional dark mode variant.
 *
 * Accepts either an already-resolved ImageMetadata object or an absolute file path string.
 * When given a string, probes the file for dimensions and format.
 *
 * Consuming projects should prefer passing imported ImageMetadata objects (the standard
 * Astro pattern) rather than string paths.
 * @param src - ImageMetadata object or absolute file path to the image
 * @param srcDark - Optional path or ImageMetadata for the dark theme variant
 * @returns Promise resolving to ImageMetadata or a { dark, light } pair
 */
export async function resolveImageSource(
	src: ImageMetadata | string,
	srcDark?: ImageMetadata | string,
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
 * Reads XMP metadata from an image file and extracts creator,
 * credit, and label information.
 * @param src - The image source (ImageMetadata or file path string)
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
		const {
			XMP: { Creator: creator, Credit: credit, Label: label } = {},
			// eslint-disable-next-line ts/no-unsafe-type-assertion -- exiftool returns untyped data
		} = (await exiftool.readRaw(absoluteSrc, { readArgs: ['-g', '-xmp:all'] })) as {
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
 * Checks if the given source is an ImageMetadata object, including
 * Astro's SVG component wrappers which nest metadata under `.meta`.
 */
export function isImageMetadataObject(src: unknown): src is ImageMetadata {
	if (src === null || src === undefined) return false
	if (typeof src !== 'object' && typeof src !== 'function') return false
	if ('src' in src && typeof src.src === 'string') return true
	// Astro wraps SVG imports in createSvgComponent in production builds,
	// placing ImageMetadata under .meta instead of at the top level.
	if ('meta' in src && typeof src.meta === 'object' && src.meta !== null) {
		return 'src' in src.meta && typeof src.meta.src === 'string'
	}

	return false
}

/**
 * Extracts a plain ImageMetadata object from a value, unwrapping Astro's SVG
 * component wrapper if necessary. SVG components are functions with metadata
 * properties spread on them — this extracts just the data as a plain object.
 */
export function unwrapImageMetadata(src: ImageMetadata): ImageMetadata {
	// Plain object with .src — already correct
	if (typeof src === 'object' && 'src' in src && typeof src.src === 'string') return src
	// SVG component function: metadata is spread on the function AND available as .meta
	// Extract .meta (a plain object) rather than returning the function
	// eslint-disable-next-line ts/no-unsafe-type-assertion -- validated by isImageMetadataObject
	if ('meta' in src) return (src as unknown as { meta: ImageMetadata }).meta
	// Fallback: extract known properties into a plain object
	const { format, height, src: imgSrc, width } = src
	return { format, height, src: imgSrc, width }
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

type SrcsetEntry = {
	url: string
	width: number
}

/**
 * Parses a srcset string and returns an array of URL/width pairs.
 */
function parseSrcset(srcset: string): SrcsetEntry[] {
	const entries: SrcsetEntry[] = []
	const parts = srcset.split(/,\s*(?=\S)/)

	for (const part of parts) {
		const trimmed = part.trim()
		if (!trimmed) continue

		// eslint-disable-next-line regexp/no-super-linear-backtracking
		const match = /^(.+?)\s+(\d+)w$/.exec(trimmed)
		if (match?.[1] && match[2]) {
			entries.push({
				url: match[1].trim(),
				width: Number.parseInt(match[2], 10),
			})
		}
	}

	return entries
}

export type ZoomTarget = {
	height: number
	srcset: string
	url: string
	width: number
}

/**
 * Extracts zoom target info from a rendered `<picture>` or `<img>` HTML string.
 * Returns the largest image URL with its dimensions and a combined srcset string
 * for PhotoSwipe's responsive zoom. Excludes dark-mode `<source>` elements.
 * @param html - HTML string containing a `<picture>` or `<img>` element
 */
export function extractZoomTarget(html: string): ZoomTarget {
	const { document } = parseHTML(html)

	const allEntries: SrcsetEntry[] = []

	// Collect srcset entries from <source> elements, skipping dark-mode variants
	const sources = document.querySelectorAll('source[srcset]')
	for (const source of sources) {
		const media = source.getAttribute('media')
		if (media?.includes('prefers-color-scheme: dark')) continue

		const srcset = source.getAttribute('srcset')
		if (srcset) {
			allEntries.push(...parseSrcset(srcset))
		}
	}

	// Get aspect ratio from the <img> element
	const img = document.querySelector('img')
	let aspectRatio = 1
	if (img) {
		const imgWidth = Number.parseInt(img.getAttribute('width') ?? '0', 10)
		const imgHeight = Number.parseInt(img.getAttribute('height') ?? '0', 10)
		if (imgWidth > 0 && imgHeight > 0) {
			aspectRatio = imgHeight / imgWidth
		}

		const srcset = img.getAttribute('srcset')
		if (srcset) {
			allEntries.push(...parseSrcset(srcset))
		}

		const src = img.getAttribute('src')
		if (src && imgWidth > 0) {
			allEntries.push({ url: src, width: imgWidth })
		}
	}

	if (allEntries.length === 0) {
		throw new Error('No images found in the provided HTML.')
	}

	// eslint-disable-next-line unicorn/no-array-reduce
	const largest = allEntries.reduce((max, entry) => (entry.width > max.width ? entry : max))

	// Build combined srcset string for PhotoSwipe responsive zoom
	const srcset = allEntries.map((entry) => `${entry.url} ${String(entry.width)}w`).join(', ')

	return {
		height: Math.round(largest.width * aspectRatio),
		srcset,
		url: largest.url,
		width: largest.width,
	}
}
