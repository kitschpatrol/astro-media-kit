import type { Props } from './Zoomer.astro'

/**
 * Translate the `zoom`-prefixed props used on embedding components into the
 * subset of `<Zoomer>` props they control. The remaining `<Zoomer>` props
 * (fallback URL) are supplied by the embedding component.
 */
export function toZoomerProps(
	props: PrefixedProps,
): Pick<Props, 'enabled' | 'level' | 'placeholder' | 'scope'> {
	return {
		enabled: props.zoom,
		level: props.zoomLevel,
		placeholder: props.zoomPlaceholder,
		scope: props.zoomScope,
	}
}

/**
 * Zoom-related props for components that embed a `<Zoomer>` (e.g. `<Image>`,
 * `<Picture>`). Renames `enabled` → `zoom` and `scope` → `zoomScope`; the
 * remaining `<Zoomer>` props (fallback URL) are supplied by the embedding
 * component.
 *
 * Lives in a standalone `.ts` module because `astro-eslint-parser` fails to
 * resolve mapped types imported across `.astro` → `.astro` file boundaries.
 */
export type PrefixedProps = {
	/**
	 * Enable the lightbox. `true` opens the item alone, a string groups items
	 * into a named gallery.
	 *
	 * @default false
	 */
	zoom?: Props['enabled']
	/**
	 * Secondary zoom level — the zoom applied when the user taps/clicks the
	 * opened lightbox image or presses its Zoom button. `'fit'` adds no second
	 * level: a click closes the fitted image. `'fill'` zooms to cover the
	 * viewport (cropping the overflowing axis), and `'native'` zooms to 100% (1:1
	 * pixels).
	 *
	 * At every level, images and videos also zoom with a pinch, on a touchscreen
	 * or a trackpad, and with the wheel while Ctrl or Command is held, and pan
	 * while enlarged. While zoomed that way, the Zoom button resets the media to
	 * fit.
	 *
	 * @default 'fit'
	 */
	zoomLevel?: Props['level']
	/**
	 * Whether to show the page thumbnail or preview while the item is in the
	 * viewer.
	 */
	zoomPlaceholder?: Props['placeholder']
	/**
	 * CSS selector defining a gallery scope boundary. When set, galleries cannot
	 * form across matching ancestors — items under separate ancestors matching
	 * the selector become separate galleries. Ignored when `zoom` is `false`.
	 */
	zoomScope?: Props['scope']
}
