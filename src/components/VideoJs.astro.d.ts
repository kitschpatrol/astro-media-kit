import type { Props as CaptionProps } from './Caption.astro'
import type { Service } from './utils/video'

type ControlStyles = 'full' | 'minimal' | 'none'

type SharedProps = Omit<CaptionProps, 'src'> & {
	autoPlay?: boolean
	controlStyle?: ControlStyles
	label?: string
	loop?: boolean
	muted?: boolean
	poster?: string
	preload?: 'auto' | 'metadata' | 'none'
}

export type Props = SharedProps & {
	service?: Service
	src: string
}

declare const VideoJs: (props: Props) => unknown
export default VideoJs
