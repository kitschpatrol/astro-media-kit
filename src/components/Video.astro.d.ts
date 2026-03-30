import type { Props as CaptionProps } from './Caption.astro'
import type { Service } from './utils/video'

type ControlStyles = 'full' | 'lightbox' | 'minimal' | 'none'

/** Props for the `<Video>` component — unified video player supporting Bunny, Cloudflare, Mux, YouTube, Vimeo, oEmbed, and local files. */
export type Props = Omit<CaptionProps, 'src'> & {
	/** Start playback automatically (muted by default for browser autoplay policies). @default false */
	autoPlay?: boolean | undefined
	/** Limit HLS quality to the element's rendered size. Saves bandwidth. @default true */
	capQualityToSize?: boolean | undefined
	/** Player chrome level. `'none'` hides all controls. @default 'full' */
	controlStyle?: ControlStyles | undefined
	/** Initial HLS bandwidth estimate in bits/s. Higher values start at higher quality. */
	initialBandwidth?: number | undefined
	/** Accessible label for the video player. Falls back to the video title. */
	label?: string | undefined
	/** Loop playback. @default false */
	loop?: boolean | undefined
	/** Mute audio. @default true */
	muted?: boolean | undefined
	/** Poster image URL. Overrides the service-provided thumbnail. */
	poster?: string | undefined
	/** Preload behavior hint. @default 'metadata' */
	preload?: 'auto' | 'metadata' | 'none' | undefined
	/** Video service override. Inferred from `src` when omitted. Required for Bunny title search. */
	service?: Service | undefined
	/** Video source: a URL, raw service ID, local file path, or Bunny title string. Component will attempt to infer the associated `service`. */
	src: string
	/** Enable PhotoSwipe zoom (lightbox). `true` uses default gallery, a string names the gallery. @default false */
	zoom?: boolean | string | undefined
}

declare const Video: (props: Props) => unknown
export default Video
