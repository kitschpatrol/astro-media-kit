import type { Props as CaptionProps } from './Caption.astro'
import type { Service } from './utils/video'

type ControlStyles = 'full' | 'minimal' | 'none'

export type Props = Omit<CaptionProps, 'src'> & {
	autoPlay?: boolean
	controlStyle?: ControlStyles
	label?: string
	loop?: boolean
	muted?: boolean
	service?: Service
} & ({ mediaId: string; mediaTitle?: never } | { mediaId?: never; mediaTitle: string })

declare const Video: (props: Props) => unknown
export default Video
