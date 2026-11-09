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

/** Everything read from the page before a subject is lifted. */
export type Measurement = {
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
	/** The item's own layout size, which holds its place in the page. */
	wrapper: { width: string; height: string }
}

/** A subject that has been lifted into a slide, and how to put it back. */
export type Lift = Measurement & {
	/** The start of the opening transition, reused to reverse it exactly. */
	from?: LayerStyle
	hadStyle: boolean
	nextSibling: ChildNode | undefined
	/** A decorative placeholder left in the page, if enabled. */
	placeholder: HTMLElement | undefined
	/** Restore selector-based picture variants when the subject returns. */
	releasePictureThemes: () => void
}

export type Slide = {
	/** A copy of the item's figcaption, if it has one. */
	caption: HTMLElement | undefined
	element: HTMLElement
	/** Sized to fit the stage; never transformed. */
	frame: HTMLElement
	item: HTMLElement
	/** Fills the frame and carries the lift transition. */
	layer: HTMLElement
	lift: Lift | undefined
	/** Holds the frame, and scrolls in both axes while the slide is zoomed. */
	stage: HTMLElement
}
