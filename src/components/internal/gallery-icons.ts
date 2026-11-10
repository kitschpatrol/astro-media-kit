/*
 * Artwork for the lightbox's and the carousel's own buttons: strokes in the
 * button's color, complete in themselves, so the page and the viewer's script
 * draw the same icon.
 */

function stroked(shapes: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.25" aria-hidden="true" focusable="false" viewBox="0 0 24 24">${shapes}</svg>`
}

/** Closes the lightbox. */
export const closeIcon = stroked('<path d="M6 6l12 12M18 6 6 18"/>')

/** Goes to the previous slide; mirrored in right-to-left layouts. */
export const previousIcon = stroked('<path d="M15 5 8 12l7 7"/>')

/** Goes to the next slide; mirrored in right-to-left layouts. */
export const nextIcon = stroked('<path d="M9 5l7 7-7 7"/>')

/** Zooms the lightbox's subject to its second level. */
export const zoomInIcon = stroked(
	'<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/>',
)

/** Zooms the lightbox's subject back to fitting. */
export const zoomOutIcon = stroked(
	'<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5"/>',
)
