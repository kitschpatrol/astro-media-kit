/**
 * The words the kit itself puts on its controls, in English. A site gives its
 * own through `mediaKit({ labels })`. Words in braces stand for a value, and
 * stay as they are in a site's own label. The player's own buttons, such as
 * Play and Mute, are labeled by Video.js.
 */
export const defaultLabels = {
	/** A local audio player without a label or a title of its own. */
	audio: 'Audio',
	/** A carousel without a label of its own. */
	carousel: 'Carousel',
	/** What a carousel, and the lightbox's gallery, is announced as. */
	carouselRole: 'carousel',
	/** The lightbox's close button. */
	close: 'Close',
	/** The tooltip of the button that returns a video from the lightbox. */
	collapse: 'Collapse',
	/** The button that returns a video from the lightbox. */
	collapseVideo: 'Collapse video',
	/** The tooltip of the button that opens a video in the lightbox. */
	expand: 'Expand',
	/** The button that opens a video in the lightbox. */
	expandVideo: 'Expand video',
	/** The lightbox's track of slides. */
	gallery: 'Gallery',
	/** One of a carousel's dots. */
	goToSlide: 'Slide {index}',
	/** The link to an audio service, shown without JavaScript. */
	listenOn: 'Listen on {service}',
	/** The button to the next slide, in a carousel and in the lightbox. */
	next: 'Next',
	/** The link a video's error message offers. */
	openVideo: 'Open video directly',
	/** A video's bar of controls. */
	playbackControls: 'Playback controls',
	/** The button to the previous slide, in a carousel and in the lightbox. */
	previous: 'Previous',
	/** A slide, in a carousel and in the lightbox. */
	slide: '{index} of {count}',
	/** What a slide is announced as. */
	slideRole: 'slide',
	/** Shown in place of a video by a browser that can't play any. */
	unsupportedVideo: 'Your browser does not support HTML5 video.',
	/** A video without a label or a title of its own. */
	video: 'Video',
	/** The lightbox itself. */
	viewer: 'Media viewer',
	/** The link to a video service, shown without JavaScript. */
	watchOn: 'Watch on {service}',
	/** The lightbox's button for its second zoom level. */
	zoom: 'Zoom',
} as const

/** The name of one of the kit's labels. */
export type LabelName = keyof typeof defaultLabels

/** Every label by name. */
export type Labels = Record<LabelName, string>

/** The names of the kit's labels. */
export const labelNames = Object.keys(defaultLabels) as LabelName[]

const PLACEHOLDER = /\{(?<name>\w+)\}/gv

/**
 * A label with its values filled in: each `{name}` in braces becomes the value
 * by that name. A placeholder without a value stays as written.
 */
export function fillLabel(label: string, values: Record<string, number | string>): string {
	return label.replaceAll(PLACEHOLDER, (placeholder, name: string) =>
		Object.hasOwn(values, name) ? String(values[name]) : placeholder,
	)
}
