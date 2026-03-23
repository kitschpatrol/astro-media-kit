import type { ImageMetadata } from 'astro'
import { imageMetadata } from 'astro/assets/utils'
import { readFile } from 'node:fs/promises'

/**
 * Probes an image file on disk and returns an ImageMetadata object.
 * Useful as a fallback when a Vite plugin returns a string path instead of ImageMetadata
 * (e.g. vite-plugin-tldraw returning an SVG path).
 * @param filePath - Absolute path to the image file on disk
 * @returns ImageMetadata with src, width, height, and format
 */
export async function probeImageMetadata(filePath: string): Promise<ImageMetadata> {
	const data = await readFile(filePath)
	const metadata = await imageMetadata(new Uint8Array(data), filePath)

	return {
		...metadata,
		src: filePath,
	}
}
