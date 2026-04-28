/**
 * Opaque image formats that don't support transparency. Background colors must
 * be composited into the image for these formats.
 */
export const opaqueFormats = new Set(['jpeg', 'jpg'])

/**
 * Determines whether a dark variant image should be generated based on
 * background colors and formats. Returns `true` when `backgroundDark` differs
 * from `background` and at least one output format is opaque (doesn't support
 * transparency), since the background gets composited into the pixels. For
 * transparent formats (PNG, WebP, AVIF, SVG), CSS `light-dark()` handles dark
 * mode instead.
 */
export function needsBackgroundDarkVariant(
	formats: readonly string[],
	background: string | undefined,
	backgroundDark: string | undefined,
	darkDisabled: boolean,
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

	return formats.some((f) => opaqueFormats.has(f))
}
