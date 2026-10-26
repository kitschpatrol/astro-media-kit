/** Use the display's gamut for decorative bitmap previews when supported. */
export function previewContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | undefined {
	if (matchMedia('(color-gamut: p3)').matches) {
		try {
			return canvas.getContext('2d', { colorSpace: 'display-p3' }) ?? undefined
		} catch {
			// Some platforms recognize P3 but cannot create a context in that space.
		}
	}

	return canvas.getContext('2d') ?? undefined
}
