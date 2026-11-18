/**
 * The page's own carousels, as the viewer sees them: it moves them along with
 * itself, so the slide whose item it shows is the one the page shows when it
 * closes, through events their controllers answer.
 */

/**
 * Move page carousels along with the viewer, which is `progress` of the way
 * from showing `from` to showing `to`. A carousel holding both items moves as
 * far between their slides; one holding only one of them shows its slide while
 * that item is the nearer.
 */
export function followInCarousels(
	from: Element | undefined,
	to: Element | undefined,
	progress: number,
) {
	const starts = carouselSlidesOf(from)
	const ends = carouselSlidesOf(progress === 0 ? undefined : to)
	for (const [track, start] of starts) {
		const end = ends.get(track)
		if (end !== undefined) {
			followCarousel(track, start + (end - start) * progress)
		} else if (progress < 0.5) {
			followCarousel(track, start)
		}
	}

	for (const [track, end] of ends) {
		if (progress >= 0.5 && !starts.has(track)) {
			followCarousel(track, end)
		}
	}
}

/**
 * The page carousel slides holding `item`, by the track each is in: one for
 * every carousel it is nested in, innermost first.
 */
function carouselSlidesOf(item: Element | undefined): Map<HTMLElement, number> {
	const slides = new Map<HTMLElement, number>()
	let slide = item?.closest<HTMLElement>('.amk-carousel-slide') ?? undefined
	while (slide !== undefined) {
		const track = slide.parentElement
		if (track?.classList.contains('amk-carousel-track') === true) {
			slides.set(track, [...track.children].indexOf(slide))
		}

		slide = track?.closest<HTMLElement>('.amk-carousel-slide') ?? undefined
	}

	return slides
}

/**
 * Have a page carousel's controller show its track `position` slides along, or
 * scroll a track without one to the nearest slide, where it would snap to.
 */
function followCarousel(track: HTMLElement, position: number) {
	const follow = new CustomEvent('amk-carousel-follow', { cancelable: true, detail: position })
	if (track.dispatchEvent(follow)) {
		scrollToSlide(track, Math.round(position))
	}
}

/** Reveal the selected slide in its page carousels without moving the document. */
export function revealCarouselItem(item: Element) {
	for (const [track, index] of carouselSlidesOf(item)) {
		const reveal = new CustomEvent('amk-carousel-reveal', { cancelable: true, detail: index })
		// Let a controller cancel its spring; tracks without one still work.
		if (track.dispatchEvent(reveal)) {
			scrollToSlide(track, index)
		}
	}
}

function scrollToSlide(track: HTMLElement, index: number) {
	const direction = track.matches(':dir(rtl)') ? -1 : 1
	track.scrollTo({ behavior: 'instant', left: direction * index * track.clientWidth })
}

/**
 * The track of the page carousel that has `element` in a slide out of view, if
 * one has. With carousels nested, the outermost such one's, as an inner track
 * is out of view along with the slide it is in.
 */
export function carouselTrackHiding(element: Element): HTMLElement | undefined {
	let track: HTMLElement | undefined
	let slide = element.closest('.amk-carousel-slide[inert]') ?? undefined
	while (slide !== undefined) {
		track = slide.parentElement ?? undefined
		slide = track?.closest('.amk-carousel-slide[inert]') ?? undefined
	}

	return track
}
