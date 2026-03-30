import type { Props as CaptionProps } from './Caption.astro'
import type { AudioService } from './utils/audio'

/** Props for the `<Audio>` component — audio player supporting SoundCloud, oEmbed, and local files. */
export type Props = Omit<CaptionProps, 'src'> & {
	/** Start playback automatically. @default false */
	autoPlay?: boolean | undefined
	/** Accessible label for the audio player. */
	label?: string | undefined
	/** Loop playback. @default false */
	loop?: boolean | undefined
	/** Mute audio. @default false */
	muted?: boolean | undefined
	/** Preload behavior hint. @default 'metadata' */
	preload?: 'auto' | 'metadata' | 'none' | undefined
	/** Audio service override. Inferred from `src` when omitted. */
	service?: AudioService | undefined
	/** Audio source: a URL, SoundCloud track ID, or local file path. */
	src: string
}

declare const Audio: (props: Props) => unknown
export default Audio
