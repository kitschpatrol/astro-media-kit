import type { ImageMetadata, ImageOutputFormat } from 'astro'
import type { HTMLAttributes } from 'astro/types'
import type { DarkLightImageMetadata } from '../types'
import type { Props as CaptionProps } from './Caption.astro'

/** Props for the `<Picture>` component — renders `<picture>` with dark mode, responsive sources, and zoom. */
export type Props = {
	/** Alt text for the image. Required for accessibility. */
	alt: string
	/** CSS class applied to the `<img>` element. */
	class?: string | undefined
	/** Attribution name for the media creator. Overrides XMP-extracted creator. */
	creator?: CaptionProps['creator']
	/** Image decoding hint. @default 'async' */
	decoding?: 'async' | 'auto' | 'sync' | undefined
	/** Pixel density descriptors for `srcset` (e.g. `[1, 2]` or `['1x', '2x']`). */
	densities?: Array<`${number}x` | number> | undefined
	/** Format for the `<img>` fallback `src`. @default 'png' */
	fallbackFormat?: ImageOutputFormat | undefined
	/** CSS `object-fit` value passed to Astro's image optimizer. */
	fit?: string | undefined
	/** Output formats for `<source>` elements. @default ['avif', 'webp'] */
	formats?: ImageOutputFormat[] | undefined
	/** Astro image layout mode. @default 'responsive' */
	layout?: 'constrained' | 'fixed' | 'full-width' | 'none' | 'responsive' | undefined
	/** Lazy-loading behavior. @default 'lazy' */
	loading?: 'eager' | 'lazy' | undefined
	/** Organization or publication to credit alongside the creator. */
	organization?: CaptionProps['organization']
	/** HTML attributes spread onto the `<picture>` element. */
	pictureAttributes?: HTMLAttributes<'picture'> | undefined
	/** CSS `object-position` value passed to Astro's image optimizer. */
	position?: string | undefined
	/** Show the credit line in the caption. @default true */
	showCredit?: CaptionProps['showCredit']
	/** `sizes` attribute for responsive images. Auto-generated when using `layout`. */
	sizes?: string | undefined
	/** Image source: `ImageMetadata`, a `{ dark, light }` pair, or an absolute file path string. */
	src: DarkLightImageMetadata | ImageMetadata | string
	/** Dark mode image variant. Rendered via `prefers-color-scheme` media query on `<source>`. */
	srcDark?: ImageMetadata | string | undefined
	/** Semantic media type label (e.g. `'photo'`, `'screenshot'`). Shown in the credit line. */
	type?: CaptionProps['type']
	/** Fallback media type when XMP Label tag is missing. @default 'image' */
	typeFallback?: CaptionProps['typeFallback']
	/** Explicit widths (in pixels) for `srcset` generation. */
	widths?: number[] | undefined
	/** Enable PhotoSwipe zoom. `true` uses default gallery, a string groups into a named gallery. @default false */
	zoom?: boolean | string | undefined
}

declare const Picture: (props: Props) => unknown
export default Picture
