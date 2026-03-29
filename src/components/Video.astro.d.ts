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
	poster?: string
	preload?: 'auto' | 'metadata' | 'none'
	zoom?: boolean | string | undefined
}

export type Props = SharedProps & {
	service?: Service
	src: string
}

declare const Video: (props: Props) => unknown
export default Video
