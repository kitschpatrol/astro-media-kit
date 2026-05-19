/**
 * Opaque image formats that don't support transparency. Background colors must
 * be composited into the image for these formats.
 */
export const opaqueFormats = new Set(['jpeg', 'jpg'])

/**
 * Determines whether a dark variant image should be generated based on
 * background colors and formats. Returns `true` when `backgroundDark` differs
 * from `background` and either:
 *
 * - `isSelector` is `true` (selector-mode dark mode needs a second `<picture>` to
 *   carry the dark `background-color` inline style — CSS `light-dark()` only
 *   responds to `prefers-color-scheme`, not custom selectors); or
 * - At least one output format is opaque, so the background must be composited
 *   into the pixels.
 *
 * For media-mode dark mode with transparent formats (PNG, WebP, AVIF, SVG), CSS
 * `light-dark()` handles the swap and no extra image is needed.
 */
export function needsBackgroundDarkVariant(
	formats: readonly string[],
	background: string | undefined,
	backgroundDark: string | undefined,
	darkDisabled: boolean,
	isSelector: boolean,
): boolean {
	if (darkDisabled) {
		return false
	}

	if (!backgroundDark) {
		return false
	}

	if (backgroundDark === background) {
		return false
	}

	if (isSelector) {
		return true
	}

	return formats.some((f) => opaqueFormats.has(f))
}
