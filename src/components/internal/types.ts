/**
 * Builds the inline style string for `<media-controller>` from video
 * dimensions.
 */
export function getControllerStyle(
	intrinsicWidth: number | undefined,
	aspectRatio: string | undefined,
): string | undefined {
	const parts: string[] = []
	if (intrinsicWidth !== undefined && intrinsicWidth !== 0 && !Number.isNaN(intrinsicWidth)) {
		parts.push(`width: ${String(intrinsicWidth)}px`)
	}

	if (aspectRatio !== undefined && aspectRatio !== '') {
		parts.push(`aspect-ratio: ${aspectRatio}`)
	}

	return parts.length > 0 ? parts.join('; ') : undefined
}

/**
 * Shared props passed from Video.astro to internal sub-components. All service
 * resolution and metadata fetching is done by Video.astro; sub-components only
 * handle rendering.
 */
export type InternalVideoProps = {
	aspectRatio: string | undefined
	autoPlay: boolean
	captions: Array<{
		label: string
		src: string
		srclang: string
	}>
	controls: 'full' | 'lightbox' | 'minimal' | 'native' | 'none'
	hlsConfig: Record<string, boolean | number>
	/** Intrinsic video width in pixels, used for native-like sizing. */
	intrinsicWidth: number | undefined
	loop: boolean
	muted: boolean
	posterUrl: string | undefined
	preload: 'auto' | 'metadata' | 'none'
	resolvedLabel: string
	videoSrc: string
	zoom: boolean
}
