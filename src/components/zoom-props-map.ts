import type { Props } from './Zoomer.astro'

/**
 * Translate the `zoom`-prefixed props used on embedding components into the
 * subset of `<Zoomer>` props they control. The remaining `<Zoomer>` props
 * (dimensions, source, srcset) are supplied by the embedding component.
 */
export function toZoomerProps(props: PrefixedProps): Pick<Props, 'enabled' | 'level' | 'scope'> {
	return { enabled: props.zoom, level: props.zoomLevel, scope: props.zoomScope }
}

/**
 * Zoom-related props for components that embed a `<Zoomer>` (e.g. `<Image>`,
 * `<Picture>`). Renames `enabled` → `zoom` and `scope` → `zoomScope`; the
 * remaining `<Zoomer>` props (dimensions, source, srcset) are inferred from the
 * wrapped child.
 *
 * Lives in a standalone `.ts` module because `astro-eslint-parser` fails to
 * resolve mapped types imported across `.astro` → `.astro` file boundaries.
 */
export type PrefixedProps = {
	/**
	 * Enable PhotoSwipe zoom. `true` uses the default gallery, a string groups
	 * items into a named gallery.
	 *
	 * @default false
	 */
	zoom?: Props['enabled']
	/**
	 * Secondary zoom level — the zoom applied when the user taps/clicks the
	 * opened lightbox image. `'fit'` keeps the image fitted to the viewport,
	 * `'fill'` zooms to cover the viewport (cropping the overflowing axis), and
	 * `'native'` zooms to 100% (1:1 pixels).
	 *
	 * @default 'fit'
	 */
	zoomLevel?: Props['level']
	/**
	 * CSS selector defining a gallery scope boundary. When set, galleries cannot
	 * form across matching ancestors — items under separate ancestors matching
	 * the selector become separate galleries. Ignored when `zoom` is `false`.
	 */
	zoomScope?: Props['scope']
}
