import type { Props as CaptionProps } from './Caption.astro'
import type { AudioService } from './utils/audio'

type SharedProps = Omit<CaptionProps, 'src'> & {
	autoPlay?: boolean
	label?: string
	loop?: boolean
	muted?: boolean
	preload?: 'auto' | 'metadata' | 'none'
}

export type Props = SharedProps & {
	service?: AudioService
	src: string
}

declare const Audio: (props: Props) => unknown
export default Audio
