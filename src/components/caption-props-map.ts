import type { Props } from './Caption.astro'

/**
 * Translate the `credit`-prefixed props used on embedding components into the
 * underlying `<Caption>` shape. Collapses `credit: boolean | string` back into
 * Caption's separate `creator` + `showCredit` fields, and renames the other
 * `credit*` siblings to their Caption counterparts.
 */
export function toCaptionProps(
	props: PrefixedProps,
	options: { src?: Props['src']; typeFallback?: Props['typeFallback'] } = {},
): Props {
	const { credit, creditMediaType, creditMediaTypeFallback, creditOrganization } = props
	return {
		creator: typeof credit === 'string' ? credit : undefined,
		organization: creditOrganization,
		showCredit: credit === true || typeof credit === 'string',
		src: options.src,
		type: creditMediaType,
		typeFallback: creditMediaTypeFallback ?? options.typeFallback,
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
	 * @default false
	 */
	credit?: boolean | string | undefined
	/**
	 * Semantic media type label (e.g. `'photo'`, `'screenshot'`). Shown in the credit line.
	 */
	creditMediaType?: Props['type']
	/**
	 * Fallback media type when XMP Label tag is missing.
	 * @default 'image'
	 */
	creditMediaTypeFallback?: Props['typeFallback']
	/**
	 * Organization or publication to credit alongside the creator.
	 */
	creditOrganization?: Props['organization']
}
