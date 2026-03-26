import type { Props as CaptionProps } from './Caption.astro'
import type { Service } from './utils/video'

type ControlStyles = 'full' | 'lightbox' | 'minimal' | 'none'

type SharedProps = Omit<CaptionProps, 'src'> & {
	autoPlay?: boolean
	capQualityToSize?: boolean
	controlStyle?: ControlStyles
	initialBandwidth?: number
	label?: string
	loop?: boolean
	muted?: boolean
	preload?: 'auto' | 'metadata' | 'none'
	zoom?: boolean | string | undefined
}

export type Props = SharedProps &
	(
		| { mediaId: string; mediaTitle?: never; poster?: never; service?: Service; src?: never }
		| { mediaId?: never; mediaTitle: string; poster?: never; service?: Service; src?: never }
		| { mediaId?: never; mediaTitle?: never; poster?: string; service?: never; src: string }
	)

declare const VideoHls: (props: Props) => unknown
export default VideoHls
