import type { ImageMetadata } from 'astro'
import type { MediaType } from '../types'
import type { Props } from './Caption.astro'
import { getCreditFromXmpTags } from './utils/image'

/**
 * Translate the `credit`-prefixed props used on embedding components into the
 * underlying `<Caption>` shape. Collapses `credit: boolean | string` back into
 * Caption's separate `creator` + `showCredit` fields, and renames the other
 * `credit*` siblings to their Caption counterparts.
 *
 * When the credit line shows and `src` is given, values the props leave unset
 * come from the image's XMP tags: `Creator`, `Credit` (the organization), and
 * `Label` (the media type). The media type falls back to
 * `creditMediaTypeFallback`, then to `typeFallback`.
 */
export async function toCaptionProps(
	props: PrefixedProps,
	options: { src?: ImageMetadata | undefined; typeFallback: MediaType },
): Promise<Props> {
	const { credit, creditMediaType, creditMediaTypeFallback, creditOrganization } = props
	const creator = typeof credit === 'string' ? credit : undefined
	const showCredit = credit === true || typeof credit === 'string'

	const xmp =
		showCredit &&
		options.src !== undefined &&
		(creator === undefined || creditOrganization === undefined || creditMediaType === undefined)
			? await getCreditFromXmpTags(options.src)
			: undefined

	return {
		creator: creator ?? xmp?.creator,
		organization: creditOrganization ?? xmp?.credit,
		showCredit,
		type: creditMediaType ?? xmp?.label ?? creditMediaTypeFallback ?? options.typeFallback,
	}
}

/**
 * Caption-related props for components that embed a `<Caption>` (e.g.
 * `<Image>`, `<Picture>`). Renames Caption's props with a `credit` prefix and
 * collapses `creator` + `showCredit` into a single `credit: boolean | string`
 * prop — mirroring the `zoom: boolean | string` pattern on `<Zoomer>` (`true`
 * shows the default credit line, `false` hides it, a string overrides the
 * creator name).
 *
 * Lives in a standalone `.ts` module because `astro-eslint-parser` fails to
 * resolve mapped types imported across `.astro` → `.astro` file boundaries.
 */
export type PrefixedProps = {
	/**
	 * Credit line control. `true` shows the credit line using XMP-extracted or
	 * explicit values, `false` hides it, and a string shows the credit line with
	 * that string as the creator name.
	 *
	 * @default false
	 */
	credit?: boolean | string | undefined
	/**
	 * Semantic media type label (e.g. `'photo'`, `'screenshot'`). Shown in the
	 * credit line.
	 */
	creditMediaType?: MediaType | undefined
	/**
	 * Media type when neither `creditMediaType` nor the image's XMP Label tag
	 * sets one. `<Video>` and `<Audio>` read no XMP and omit this prop.
	 *
	 * @default 'image'
	 */
	creditMediaTypeFallback?: MediaType | undefined
	/**
	 * Organization or publication to credit alongside the creator.
	 */
	creditOrganization?: Props['organization']
}
