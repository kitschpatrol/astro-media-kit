import type { ImageMetadata } from 'astro'

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
