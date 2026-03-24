import type { ImageMetadata } from 'astro'

/**
 * Accepts `ImageMetadata` with a relaxed `format` field (`string` instead of
 * the narrow `ImageOutputFormat` union). This lets plugins like unplugin-aphex
 * pass their results directly without a cast.
 */
export type ImageMetadataLike = Omit<ImageMetadata, 'format'> & { format: string }

/** A pair of image metadata objects for dark and light color schemes. */
export type DarkLightImageMetadata = {
	dark: ImageMetadata
	light: ImageMetadata
}

/** Valid media type labels for captions and credits. */
export type MediaType =
	| 'animation'
	| 'diagram'
	| 'illustration'
	| 'image'
	| 'photo'
	| 'render'
	| 'screenshot'
	| 'video'
