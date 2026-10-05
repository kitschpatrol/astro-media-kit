import type { GetImageResult } from 'astro'

/**
 * Choose a generated fallback asset without flattening picture formats or
 * themes.
 */
export function imageFallback(image: GetImageResult): string {
	let url = image.src
	let width = 0
	for (const candidate of image.srcSet.values) {
		const candidateWidth = Number(candidate.transform.width)
		if (!(candidateWidth > width)) {
			continue
		}

		width = candidateWidth
		url = candidate.url
	}

	return url
}
