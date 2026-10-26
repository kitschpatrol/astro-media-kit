import type { GetImageResult } from 'astro'

/** The input formats the image pipeline accepts, by file extension. */
const imageExtensions = new Set([
	'avif',
	'gif',
	'heic',
	'heif',
	'jpeg',
	'jpg',
	'png',
	'svg',
	'tif',
	'tiff',
	'webp',
])

/** Where a path or URL's query or fragment starts. */
const queryPattern = /[#?]/v

/**
 * Whether a source string names an image rather than a video, by the extension
 * of its path or URL, with any query or fragment ignored.
 */
export function isImageSource(src: string): boolean {
	const path = src.split(queryPattern, 1)[0] ?? ''
	const dot = path.lastIndexOf('.')
	return dot !== -1 && imageExtensions.has(path.slice(dot + 1).toLowerCase())
}

/**
 * What the lightbox needs to know about a generated image: the URL a link falls
 * back to, which is the largest candidate, and the width at which the image
 * shows one of its pixels per CSS pixel, which is the largest width descriptor
 * the browser can select. Neither flattens picture formats or themes; the
 * viewer lifts the real responsive element. Density candidates have no single
 * native width, so the viewer measures those once they load.
 */
export function zoomTarget(image: GetImageResult): { href: string; nativeWidth?: number } {
	let href = image.src
	let largest = 0
	let nativeWidth = image.srcSet.values.length === 0 ? Number(image.attributes.width) : undefined
	for (const candidate of image.srcSet.values) {
		const width = Number(candidate.transform.width)
		if (!(width > largest)) {
			continue
		}

		largest = width
		href = candidate.url
		if (candidate.descriptor?.endsWith('w') === true) {
			nativeWidth = width
		}
	}

	return { href, nativeWidth }
}
