import type { ImageMetadata } from 'astro'
import type { LocalImageProps } from 'astro:assets'
import type { Props as CaptionProps } from './Caption.astro'

/** Props for the `<Image>` component — wraps Astro's `<Image>` with caption and zoom support. */
export type Props = Omit<CaptionProps, 'src'> &
	Omit<LocalImageProps, 'src'> & {
		/** Image source: an imported `ImageMetadata` object or an absolute file path string. */
		src: ImageMetadata | string
		/** Enable PhotoSwipe zoom. `true` uses default gallery, a string groups into a named gallery. @default false */
		zoom?: boolean | string | undefined
	}

declare const Image: (props: Props) => unknown
export default Image
