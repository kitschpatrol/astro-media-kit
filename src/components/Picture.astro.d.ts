import type { ImageMetadata, ImageOutputFormat } from 'astro'
import type { HTMLAttributes } from 'astro/types'
import type { DarkLightImageMetadata } from '../types'
import type { Props as CaptionProps } from './Caption.astro'

export type Props = {
	alt: string
	class?: string | undefined
	creator?: CaptionProps['creator']
	decoding?: 'async' | 'auto' | 'sync' | undefined
	densities?: Array<`${number}x` | number> | undefined
	fallbackFormat?: ImageOutputFormat | undefined
	fit?: string | undefined
	formats?: ImageOutputFormat[] | undefined
	layout?: 'constrained' | 'fixed' | 'full-width' | 'none' | 'responsive' | undefined
	loading?: 'eager' | 'lazy' | undefined
	organization?: CaptionProps['organization']
	pictureAttributes?: HTMLAttributes<'picture'> | undefined
	position?: string | undefined
	showCredit?: CaptionProps['showCredit']
	sizes?: string | undefined
	src: DarkLightImageMetadata | ImageMetadata | string
	srcDark?: ImageMetadata | string | undefined
	type?: CaptionProps['type']
	typeFallback?: CaptionProps['typeFallback']
	widths?: number[] | undefined
	zoom?: boolean | string | undefined
}

declare const Picture: (props: Props) => unknown
export default Picture
