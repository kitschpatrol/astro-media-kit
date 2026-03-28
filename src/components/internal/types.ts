/**
 * Shared props passed from Video.astro to internal sub-components.
 * All service resolution and metadata fetching is done by Video.astro;
 * sub-components only handle rendering.
 */
export type InternalVideoProps = {
	aspectRatio: string | undefined
	autoPlay: boolean
	captions: Array<{
		label: string
		src: string
		srclang: string
	}>
	controlStyle: 'full' | 'lightbox' | 'minimal' | 'none'
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
