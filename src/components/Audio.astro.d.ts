import type { Props as CaptionProps } from './Caption.astro'
import type { AudioService } from './utils/audio'

type SharedProps = Omit<CaptionProps, 'src'> & {
	autoPlay?: boolean
	label?: string
	loop?: boolean
	muted?: boolean
	preload?: 'auto' | 'metadata' | 'none'
}

export type Props = SharedProps &
	(
		| { mediaId: string; service?: AudioService; src?: never }
		| { mediaId?: never; service?: never; src: string }
	)

declare const Audio: (props: Props) => unknown
export default Audio
