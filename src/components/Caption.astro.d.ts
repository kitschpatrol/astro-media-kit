import type { ImageMetadata } from 'astro'
import type { MediaType } from '../types'

/** Props for the `<Caption>` component — wraps content in `<figure>`/`<figcaption>` with optional XMP credit extraction. */
export type Props = {
	/** Attribution name for the media creator. Overrides XMP-extracted creator. */
	creator?: string | undefined
	/** Organization or publication to credit alongside the creator. */
	organization?: string | undefined
	/** Show the credit line in the caption. @default true */
	showCredit?: boolean | undefined
	/** Image source for XMP metadata extraction. Not rendered directly. */
	src?: ImageMetadata | string | undefined
	/** Semantic media type label (e.g. `'photo'`, `'screenshot'`). Shown in the credit line. */
	type?: MediaType | undefined
	/** Fallback media type when XMP Label tag is missing. @default 'image' */
	typeFallback?: MediaType | undefined
}

declare const Caption: (props: Props) => unknown
export default Caption
