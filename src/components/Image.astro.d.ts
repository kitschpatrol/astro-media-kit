import type { ImageMetadata } from 'astro'
import type { LocalImageProps } from 'astro:assets'
import type { Props as CaptionProps } from './Caption.astro'

export type Props = Omit<CaptionProps, 'src'> &
	Omit<LocalImageProps, 'src'> & {
		src: ImageMetadata | string
		zoom?: boolean | string | undefined
	}

declare const Image: (props: Props) => unknown
export default Image
