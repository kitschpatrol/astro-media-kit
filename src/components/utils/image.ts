import type { ImageMetadata } from 'astro'
import { isUrlInstance } from '@sindresorhus/is'
// TODO Mocking this for now
// import { emitImageMetadata } from 'astro/assets/utils'
import { exiftool } from 'exiftool-vendored'
import { parseHTML } from 'linkedom'
import { emitImageMetadata } from '../../utilities/mocks'
import {
	getAbsoluteFilePath,
	getFileExtension,
	getPathWithoutExtension,
	resolveAliases,
	stripCwd,
} from '../../utilities/path'

/**
 Retrieves image metadata from the assets directory, with optional support for dark mode variants.
 
 This function loads images from the assets directory and returns their metadata. It supports:
 - Regular images (jpg, png, etc.)
 - SVG images generated from TLDR files (tldraw)
 - Dark and light theme variants of the same image (automatically for tldr files)
 - NOT compatible with non-imported vite-plugin-aphex images!
 
 When dark mode variants are requested (either via srcDark or autoDarkMode), the function
 verifies that both variants have matching dimensions and formats.
 * @param src - Path to the image in assets directory (with or without file extension).
 * @param srcDark - Optional path to the dark theme variant of the image
 * @param autoDarkMode - When true and for TLDR files, automatically generates dark variants
 * @returns Promise resolving to either a single ImageMetadata object or an object containing both dark and light variants
 * @throws {Error} when dark/light images have different formats or when images aren't found
 */
export async function getImageFromAssets(
	src: string,
	srcDark?: string,
	autoDarkMode = false,
): Promise<ImageMetadata | { dark: ImageMetadata; light: ImageMetadata }> {
	// Reminder about aphex virtual links...
	if (src.startsWith('~aphex/')) {
		throw new Error(
			'Aphex virtual links are not supported in getImageFromAssets, `import()` or `await import()` them instead.',
		)
	}

	// Support images without extensions, trusting the names to be unique
	// Seems like a bad idea, but helps if image assets are generated and
	// processed into variable formats during optimization.
	src = getAssetSrcWithExtension(src)

	if (getFileExtension(src) === '.tldr') {
		// Vite-plugin-tldraw kicks in...
		const imageMetadataLight = await importImageFromAssets(src)

		if (srcDark !== undefined || autoDarkMode) {
			const imageMetadataDark = await importImageFromAssets(src, true)
			assertLightDarkImageParity(imageMetadataLight, imageMetadataDark)
			return { dark: imageMetadataDark, light: imageMetadataLight }
		}

		return imageMetadataLight
	}

	const imageMetadataLight = await importImageFromAssets(src)

	if (srcDark !== undefined) {
		const imageMetadataDark = await importImageFromAssets(srcDark, true)
		assertLightDarkImageParity(imageMetadataLight, imageMetadataDark)
		return { dark: imageMetadataDark, light: imageMetadataLight }
	}

	return imageMetadataLight
}

/**
 * Extracts metadata credit information from an image's XMP tags.
 *
 * This function reads XMP metadata from an image file and extracts creator,
 * credit, and label information. It handles both extension and extension-less
 * image paths and converts relative paths to absolute paths for processing.
 * @param src - The relative path to the image file
 * @returns A promise that resolves to an object containing:
 *          - creator: The image creator name (first if multiple)
 *          - credit: The credit attribution text
 *          - label: The label text
 */
export async function getCreditFromXmpTags(src: ImageMetadata | string): Promise<{
	creator: string | undefined
	credit: string | undefined
	label: string | undefined
}> {
	// In production, splice in dist... what a mess
	const isProduction = import.meta.env.MODE === 'production'
	const absoluteSrc = getAbsoluteFilePath(src, isProduction)

	// eslint-disable-next-line ts/no-unsafe-type-assertion, ts/no-useless-default-assignment
	const { XMP: { Creator: creator, Credit: credit, Label: label } = {} } = (await exiftool.readRaw(
		absoluteSrc,
		{ readArgs: ['-g', '-xmp:all'] },
	)) as {
		// eslint-disable-next-line ts/naming-convention
		XMP: {
			// eslint-disable-next-line ts/naming-convention
			Creator?: string | string[] | undefined
			// eslint-disable-next-line ts/naming-convention
			Credit?: string | undefined
			// eslint-disable-next-line ts/naming-convention
			Label?: string | undefined
		}
	}

	return { creator: Array.isArray(creator) ? creator[0] : creator, credit, label }
}

// Helper functions

async function importImageFromAssets(
	src: string,
	/** Used to pass parameters to vite-plugin-tldraw */
	darkQuery = false,
): Promise<ImageMetadata> {
	const cleanSrc = stripCwd(resolveAliases(src))

	// Thank god for query... https://github.com/vitejs/vite/discussions/8695
	const assets = darkQuery
		? import.meta.glob('/src/assets/**', { query: { dark: true, tldr: '' } })
		: import.meta.glob('/src/assets/**')

	// eslint-disable-next-line ts/no-unsafe-type-assertion
	const imageMetadataPromise = assets[cleanSrc] as () => Promise<{
		default: ImageMetadata | string
	}>
	if (typeof imageMetadataPromise !== 'function') {
		// eslint-disable-next-line unicorn/prefer-type-error
		throw new Error(
			`Image not found in import.meta.glob for: ${cleanSrc} in: ${JSON.stringify(assets, undefined, 2)}`,
		)
	}

	// TLDR can return a string or an ImageMetadata object...
	const { default: imageMetadataOrString } = await imageMetadataPromise()

	// Technically we can fish out metadata ourselves instead of getting it from
	// vite, but this seems to lead to some weird behavior with the image service.
	if (typeof imageMetadataOrString === 'string') {
		console.warn(`Generating image metadata at runtime for: ${imageMetadataOrString}`)
		const imageMetadataResult = await emitImageMetadata(`./${imageMetadataOrString}`)

		if (imageMetadataResult === undefined) {
			throw new Error(`Image metadata not found for: ${imageMetadataOrString}`)
		}
		return imageMetadataResult
	}

	return imageMetadataOrString
}

function assertLightDarkImageParity(light: ImageMetadata, dark: ImageMetadata): void {
	if (light.format !== dark.format) {
		throw new Error('Dark and light images must have the same format.')
	}

	if (light.width !== dark.width || light.height !== dark.height) {
		throw new Error('Dark and light images must have the same dimensions.')
	}
}

function getAssetSrcWithExtension(src: ImageMetadata | string | URL): string {
	const srcString = isImageMetadataObject(src) ? src.src : isUrlInstance(src) ? src.toString() : src
	const existingExtension = getFileExtension(srcString)

	if (existingExtension !== '') {
		return srcString
	}

	// If the src is extension-less, resolve the extension from the import glob
	const assets = import.meta.glob('/src/assets/**')

	// Resolve extension if necessary
	const assetKeys = Object.keys(assets)
	const match = assetKeys.find((key) => getPathWithoutExtension(key) === srcString)

	if (match === undefined) {
		throw new Error(`Image src with extension not found in import.meta.glob for: ${srcString}}`)
	}

	return match
}

/**
 * Checks if the given source is an ImageMetadata object.
 * @param src - The source to check.
 * @returns True if the source is an ImageMetadata object, false otherwise.
 */
export function isImageMetadataObject(src: unknown): src is ImageMetadata {
	return typeof src === 'object' && src !== null && 'src' in src && typeof src.src === 'string'
}

type SrcsetEntry = {
	url: string
	width: number
}

/**
 * Parses a srcset string and returns an array of URL/width pairs
 */
function parseSrcset(srcset: string): SrcsetEntry[] {
	const entries: SrcsetEntry[] = []

	// Split by comma, but be careful with URLs that might contain commas (unlikely but safe)
	const parts = srcset.split(/,\s*(?=\S)/)

	for (const part of parts) {
		const trimmed = part.trim()
		if (!trimmed) continue

		// Match URL followed by optional width descriptor (e.g., "1080w")
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

/**
 * Extracts the largest image URL from a <picture> element HTML string.
 * Searches through all <source> and <img> srcset attributes to find
 * the URL with the highest width descriptor.
 * @param html - HTML string containing a <picture> element
 * @returns The URL of the largest image
 * @throws {Error} if no images are found in the provided HTML
 */
export function extractLargestImageUrl(html: string): string {
	const { document } = parseHTML(html)

	const allEntries: SrcsetEntry[] = []

	// Get all source elements and their srcset
	const sources = document.querySelectorAll('source[srcset]')
	for (const source of sources) {
		const srcset = source.getAttribute('srcset')
		if (srcset) {
			allEntries.push(...parseSrcset(srcset))
		}
	}

	// Get img element srcset and src
	const img = document.querySelector('img')
	if (img) {
		const srcset = img.getAttribute('srcset')
		if (srcset) {
			allEntries.push(...parseSrcset(srcset))
		}

		// Also consider the img src with its width attribute as a fallback
		const src = img.getAttribute('src')
		const width = img.getAttribute('width')
		if (src && width) {
			allEntries.push({
				url: src,
				width: Number.parseInt(width, 10),
			})
		}
	}

	if (allEntries.length === 0) {
		throw new Error('No images found in the provided HTML.')
	}

	// Find the entry with the largest width
	// eslint-disable-next-line unicorn/no-array-reduce
	const largest = allEntries.reduce((max, entry) => (entry.width > max.width ? entry : max))

	return largest.url
}
