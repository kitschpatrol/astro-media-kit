// Components
export { default as Caption } from './components/Caption.astro'
// Types
export type { Props as CaptionProps } from './components/Caption.astro'
export { default as Image } from './components/Image.astro'
export type { Props as ImageProps } from './components/Image.astro'
export { default as Picture } from './components/Picture.astro'

export type { Props as PictureProps } from './components/Picture.astro'
// Utilities
export { isImageMetadataObject, resolveImageSource } from './components/utils/image'
export { default as Video } from './components/Video.astro'
export type { Props as VideoProps } from './components/Video.astro'
export { default as Zoomer } from './components/Zoomer.astro'

export type { DarkLightImageMetadata, MediaType } from './types'
export { probeImageMetadata } from './utilities/image-probe'
