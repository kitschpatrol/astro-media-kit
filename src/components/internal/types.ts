import type { HlsSourceOptions } from './video-source'
export type { HlsSourceOptions, VideoElementTag } from './video-source'

/** The player's control bar layout. */
export type Controls = 'full' | 'lightbox' | 'minimal' | 'native' | 'none'

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
	controls: Controls
	/** The video's length in seconds, where its service or a probe reported one. */
	duration: number | undefined
	hlsOptions: HlsSourceOptions
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
