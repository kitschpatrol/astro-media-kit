/**
 * Shared props passed from Audio.astro to internal sub-components.
 * All service resolution is done by Audio.astro;
 * sub-components only handle rendering.
 */
export type InternalAudioProps = {
	autoPlay: boolean
	loop: boolean
	muted: boolean
	preload: 'auto' | 'metadata' | 'none'
	resolvedLabel: string
	src: string
}
