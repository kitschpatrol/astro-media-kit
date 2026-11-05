import type { Box, Fit } from './geometry'
import type { Lift, Measurement, Point, Slide } from './types'
import { releaseControlPreview, retainControlPreview } from './control-preview'
import { isLinkItem, move, releaseInstance, rendered, subjectOf } from './dom'
import { lengthOf } from './geometry'
import { releaseImagePreview, retainImage, returnImagePreview } from './image-preview'
import { ratioOf } from './media'
import { createPlaceholder, placePlaceholder, removePlaceholder } from './placeholder'
import { adoptControls, closePopups, refreshPopups, releaseControls } from './player-controls'
import { releasePreparation } from './prepare'
import { releaseWarmup } from './warm-image'

/**
 * Images and videos crossfade with the preview left on the page. Ordinary HTML
 * can reflow at the viewer's size, so it cuts over instead.
 */
export function canFade(lift: Lift): boolean {
	const visible = rendered(lift.subject)
	return (
		lift.placeholder?.checkVisibility() === true &&
		(visible instanceof HTMLImageElement ||
			visible instanceof HTMLVideoElement ||
			visible.matches('media-container'))
	)
}

/** Put lifted subjects back where they came from, in one task. */
export function dropSlides(slides: Slide[]) {
	const subjects: Element[] = []
	for (const slide of slides) {
		const { lift } = slide
		if (lift === undefined) {
			continue
		}

		slide.lift = undefined
		const { item } = lift
		if (isLinkItem(item)) {
			releaseImagePreview(lift.subject)
			// A link's media is for the viewer alone: it goes away, and the next
			// use starts afresh
			releaseControls(lift.subject)
			releasePreparation(lift.subject)
			lift.subject.remove()
			releaseInstance(item)
			delete item.dataset.lifted
			continue
		}

		// A popup still on its way out can't be carried by a move in this task
		if (closePopups(lift.subject)) {
			refreshPopups(lift.subject)
		}

		if (!move(item, lift.subject, lift.nextSibling)) {
			refreshPopups(lift.subject)
		}

		removePlaceholder(lift.placeholder)
		releaseControlPreview(lift.subject)

		item.style.removeProperty('--amk-lightbox-placeholder-width')
		item.style.removeProperty('--amk-lightbox-placeholder-height')
		item.style.removeProperty('--amk-lightbox-placeholder-ratio')
		if (!lift.hadStyle && item.style.length === 0) {
			item.removeAttribute('style')
		}

		releasePreparation(lift.subject)
		delete item.dataset.lifted
		for (const image of lift.asyncImages) {
			image.decoding = 'async'
		}

		returnImagePreview(lift.subject, item)

		subjects.push(lift.subject)
	}

	// Lay the subjects out again in this task, for WebKit's media pipeline,
	// then skip any transitions the page's own styles start for the move
	subjects[0]?.getBoundingClientRect()
	for (const subject of subjects) {
		const animations = subject.getAnimations({ subtree: true })
		for (const animation of animations) {
			if (animation instanceof CSSTransition) {
				animation.finish()
			}
		}
	}

	// A player's control bar goes back last, so that its fade into the player
	// isn't among the transitions just skipped
	for (const subject of subjects) {
		releaseControls(subject)
	}
}

/** Move one subject from the page into its slide. */
export function liftSlide(slide: Slide, measurement: Measurement) {
	if (slide.lift !== undefined) {
		return
	}

	const { item, subject } = measurement
	// Async decoding flashes the background while Chromium swaps in a larger
	// srcset candidate
	const asyncImages = imagesIn(subject).filter((image) => image.decoding === 'async')
	for (const image of asyncImages) {
		image.decoding = 'auto'
	}

	// A link's media was never in the page: nothing holds its place or stands in
	const isLink = isLinkItem(item)
	if (!isLink) {
		retainControlPreview(item, subject)
	}

	const placeholder = isLink ? undefined : createPlaceholder(item, subject)
	retainImage(subject, slide.layer)
	slide.lift = {
		...measurement,
		asyncImages,
		hadStyle: item.hasAttribute('style'),
		nextSibling: subject.nextSibling ?? undefined,
		placeholder: placeholder?.element,
	}
	// On the slide, where both the frame and a stage beside a caption read it
	slide.element.style.setProperty('--amk-lightbox-ratio', String(measurement.ratio))
	const hold = isLink ? '' : holdOf(item, subject, measurement.wrapper)
	item.dataset.lifted = hold
	// A popup still on its way out can't be carried by a move in this task
	if (closePopups(subject)) {
		refreshPopups(subject)
	}

	if (!move(slide.layer, subject)) {
		refreshPopups(subject)
	}

	adoptControls(subject)
	if (isLink) {
		// The kit's media script sets up the media that is in the page as it
		// loads; this media has only just arrived
		subject.dispatchEvent(new Event('amk-media-connected', { bubbles: true }))
	}

	if (hold === 'size') {
		item.style.setProperty('--amk-lightbox-placeholder-width', measurement.wrapper.width)
		item.style.setProperty('--amk-lightbox-placeholder-height', measurement.wrapper.height)
	} else if (hold === 'ratio') {
		item.style.setProperty(
			'--amk-lightbox-placeholder-ratio',
			`${lengthOf(measurement.wrapper.width)} / ${lengthOf(measurement.wrapper.height)}`,
		)
	}

	if (placeholder !== undefined) {
		placePlaceholder(item, placeholder, measurement.home, hold !== 'size')
	}

	releaseWarmup(subject)
}

/** How a wrapper's space is held while its subject is lifted. */
type Hold = '' | 'ratio' | 'size'

/**
 * Measure the wrapper without its subject to decide how to hold its space. One
 * that keeps its width gets it from its container, so the subject's aspect
 * ratio holds the height and the space follows a resize. One that collapses is
 * sized by its content, so its measured size holds. One that keeps both needs
 * no hold. The subject is taken out of flow for the measurement rather than out
 * of the wrapper: it stays put, and the wrapper's layout is current, which it
 * isn't in Chromium right after a state-preserving move out of it.
 */
function holdOf(item: HTMLElement, subject: Element, wrapper: Measurement['wrapper']): Hold {
	const width = lengthOf(wrapper.width)
	const height = lengthOf(wrapper.height)
	if (!Number.isFinite(width) || !Number.isFinite(height)) {
		return 'size'
	}

	const style =
		subject instanceof HTMLElement || subject instanceof SVGElement ? subject.style : undefined
	const position = style?.getPropertyValue('position')
	const priority = style?.getPropertyPriority('position')
	const { emptyWidth, emptyHeight } = withScrollKept(item, () => {
		style?.setProperty('position', 'absolute', 'important')
		const empty = getComputedStyle(item)
		const measured = { emptyWidth: lengthOf(empty.width), emptyHeight: lengthOf(empty.height) }
		if (position === undefined || position === '') {
			style?.removeProperty('position')
		} else {
			style?.setProperty('position', position, priority)
		}

		return measured
	})

	if (!(Math.abs(emptyWidth - width) < 0.5)) {
		return 'size'
	}

	return Math.abs(emptyHeight - height) < 0.5 ? '' : 'ratio'
}

/**
 * Run `read`, which lays the page out shorter for a moment, without letting
 * that move the page: a scroll position at the bottom would otherwise be
 * clamped to the shorter page, in the window and in any scroll container the
 * item sits in, and stay there.
 */
function withScrollKept<T>(item: Element, read: () => T): T {
	const ancestors: Array<[Element, number, number]> = []
	for (let node = item.parentElement; node !== null; node = node.parentElement) {
		ancestors.push([node, node.scrollTop, node.scrollLeft])
	}

	const { scrollX, scrollY } = globalThis
	try {
		return read()
	} finally {
		for (const [node, top, left] of ancestors) {
			if (node.scrollTop !== top) {
				node.scrollTop = top
			}

			if (node.scrollLeft !== left) {
				node.scrollLeft = left
			}
		}

		if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
			window.scrollTo({ behavior: 'instant', left: scrollX, top: scrollY })
		}
	}
}

function fitOf(element: Element, objectFit: string): Fit {
	if (!(element instanceof HTMLImageElement) && !(element instanceof HTMLVideoElement)) {
		return 'fill'
	}

	return objectFit === 'cover' || objectFit === 'fill' ? objectFit : 'contain'
}

/** The images whose `decoding` matters when `subject` is laid out larger. */
function imagesIn(subject: Element): HTMLImageElement[] {
	const images = [...subject.querySelectorAll('img')]
	return subject instanceof HTMLImageElement ? [subject, ...images] : images
}

/**
 * Percentage positions cover the usual focal-point crops; other expressions
 * skip the morph.
 */
function positionOf(value: string): Point | undefined {
	const parts = value.split(' ')
	if (parts.length !== 2 || parts.some((part) => !part.endsWith('%'))) {
		return undefined
	}

	const [x, y] = parts.map((part) => Number(part.slice(0, -1)) / 100)
	return x !== undefined && y !== undefined && x >= 0 && x <= 1 && y >= 0 && y <= 1
		? { x, y }
		: undefined
}

/** Measure the subject and its home before changing either layout. */
export function measure(item: HTMLElement): Measurement | undefined {
	const subject = subjectOf(item)
	if (subject === undefined) {
		return undefined
	}

	if (isLinkItem(item)) {
		return measureLink(item, subject)
	}

	const visible = rendered(subject)
	const home = item.getBoundingClientRect()
	const rect = visible.getBoundingClientRect()
	const style = getComputedStyle(visible)
	// Layout sizes, unaffected by transforms such as a hover zoom
	const { width, height } = getComputedStyle(item)
	const target = { height: rect.height, width: rect.width, x: rect.x, y: rect.y }

	return {
		fit: fitOf(visible, style.objectFit),
		home: { height: home.height, width: home.width, x: home.x, y: home.y },
		item,
		offset: { ...target, x: rect.x - home.x, y: rect.y - home.y },
		position: positionOf(style.objectPosition),
		radius: radiusOf(style.borderTopLeftRadius, target),
		ratio: ratioOf(visible, target),
		subject,
		target,
		wrapper: { width, height },
	}
}

/**
 * A link's media has no place in the page: it grows out of the link's own box,
 * and goes back into it, at the ratio the media says it has.
 */
function measureLink(item: HTMLElement, subject: Element): Measurement {
	const home = item.getBoundingClientRect()
	const box = { height: home.height, width: home.width, x: home.x, y: home.y }
	return {
		fit: 'contain',
		home: box,
		item,
		offset: { ...box, x: 0, y: 0 },
		position: { x: 0.5, y: 0.5 },
		radius: 0,
		ratio: ratioOf(rendered(subject), { height: 0, width: 0, x: 0, y: 0 }),
		subject,
		target: box,
		wrapper: { width: '', height: '' },
	}
}

/**
 * A corner radius in px, with a percentage resolved against the box and the
 * result clamped to half its size. Elliptical radii count as square corners.
 */
function radiusOf(value: string, box: Box): number {
	const shorter = Math.min(box.width, box.height)
	const radius = value.endsWith('%')
		? (Number(value.slice(0, -1)) / 100) * shorter
		: value.endsWith('px')
			? Number(value.slice(0, -2))
			: 0
	return Number.isFinite(radius) ? Math.min(radius, shorter / 2) : 0
}
