/** Props for the `<Zoomer>` component — PhotoSwipe-based image zoom wrapper. */
export type Props = {
	/** Enable zoom. `true` uses default gallery, a string groups images into a named gallery. @default false */
	zoom?: boolean | string | undefined
}

declare const Zoomer: (props: Props) => unknown
export default Zoomer
