import type { Box, Fit } from './geometry'

/** A point in viewport coordinates. */
export type Point = { x: number; y: number }

/** Translate, scale, and clip-path values for the animated layer of a frame. */
export type LayerStyle = {
	clipPath: string
	opacity: string
	scale: string
	translate: string
}

/** Geometry shared by every kind of slide content. */
type SlideGeometry = {
	fit: Fit
	/** The item's border box in the viewport. */
	home: Box
	item: HTMLElement
	/** The visible content box relative to the item's border box. */
	offset: Box
	position: Point | undefined
	radius: number
	ratio: number
	subject: Element
	/** The visible content box in the viewport. */
	target: Box
}

export type Margins = { bottom: number | undefined; top: number | undefined }
export type WrapperSize = { width: string; height: string }

/** Only a subject that leaves the page needs its wrapper held in place. */
export type Measurement = SlideGeometry &
	({ kind: 'copy' | 'link' } | { kind: 'move'; margins: Margins; wrapper: WrapperSize })

/** Page state to restore after moving a live subject. */
type MovedContent = {
	hadStyle: boolean
	kind: 'move'
	nextSibling: ChildNode | undefined
	/** A decorative placeholder left in the page, if enabled. */
	placeholder: HTMLElement | undefined
	/** Where the placeholder lies in the item, for laying it out another way. */
	placeholderBox: Box | undefined
	/**
	 * An invisible stand-in for the subject in the item, once the page has been
	 * laid out anew, which sizes the item as the subject would.
	 */
	probe: HTMLElement | undefined
	/** Give the item its own margins back when the subject returns. */
	releaseMargins: () => void
}

/** The mounted content and the state needed to release it. */
export type Lift = SlideGeometry & {
	from?: LayerStyle
	releasePictureThemes: () => void
} & (MovedContent | { kind: 'copy'; original: Element } | { kind: 'link' })

export type Slide = {
	/** A copy of the item's figcaption, if it has one. */
	caption: HTMLElement | undefined
	element: HTMLElement
	/** Sized to fit or zoom, and translated while panning. */
	frame: HTMLElement
	item: HTMLElement
	/** Fills the frame and carries the lift transition. */
	layer: HTMLElement
	lift: Lift | undefined
	/** Holds the frame and clips it to the viewport while zoomed. */
	stage: HTMLElement
}
