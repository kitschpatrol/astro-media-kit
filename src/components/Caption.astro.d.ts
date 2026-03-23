import type { ImageMetadata } from 'astro'
import type { MediaType } from '../types'

export type Props = {
	creator?: string | undefined
	organization?: string | undefined
	showCredit?: boolean | undefined
	src?: ImageMetadata | string | undefined
	type?: MediaType | undefined
	typeFallback?: MediaType | undefined
}

declare const Caption: (props: Props) => unknown
export default Caption
