import type { Box, Fit } from './geometry'
import type { Lift, Measurement, Point, Slide } from './types'
import { move, rendered, subjectOf } from './dom'
import { lengthOf } from './geometry'
import { createPlaceholder, placePlaceholder, removePlaceholder } from './placeholder'
import { releaseControls } from './player-controls'
import { releasePreparation } from './prepare'
import { useWarmup } from './warm-image'

/**
 * Whether a lifted subject can crossfade with its placeholder. Only an image's
 * copy matches it pixel for pixel. A video's canvas preview, and HTML laid out
 * at the viewer's size, would ghost against the original, so those cut over.
 */
export function canFade(lift: Lift): boolean {
	return (
		lift.placeholder?.checkVisibility() === true &&
		rendered(lift.subject) instanceof HTMLImageElement
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
		releaseControls(lift.subject)
		move(item, lift.subject, lift.nextSibling)
		removePlaceholder(lift.placeholder)

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

	const placeholder = createPlaceholder(item, subject)
	slide.lift = {
		...measurement,
		asyncImages,
		hadStyle: item.hasAttribute('style'),
		nextSibling: subject.nextSibling ?? undefined,
		placeholder: placeholder?.element,
	}
	// On the slide, where both the frame and a stage beside a caption read it
	slide.element.style.setProperty('--amk-lightbox-ratio', String(measurement.ratio))
	const hold = holdOf(item, subject, measurement.wrapper)
	item.dataset.lifted = hold
	move(slide.layer, subject)
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

	useWarmup(subject)
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
	style?.setProperty('position', 'absolute', 'important')
	const empty = getComputedStyle(item)
	const emptyWidth = lengthOf(empty.width)
	const emptyHeight = lengthOf(empty.height)
	if (position === undefined || position === '') {
		style?.removeProperty('position')
	} else {
		style?.setProperty('position', position, priority)
	}

	if (!(Math.abs(emptyWidth - width) < 0.5)) {
		return 'size'
	}

	return Math.abs(emptyHeight - height) < 0.5 ? '' : 'ratio'
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

/**
 * The natural aspect ratio of the content. Width and height attributes are
 * preferred over the box while an image is still loading, since `sizes="auto"`
 * images report no natural size until they have one.
 */
function ratioOf(element: Element, box: Box): number {
	if (element instanceof HTMLImageElement && element.complete && element.naturalHeight > 0) {
		return element.naturalWidth / element.naturalHeight
	}

	if (element instanceof HTMLVideoElement && element.videoHeight > 0) {
		return element.videoWidth / element.videoHeight
	}

	const width = Number(element.getAttribute('width'))
	const height = Number(element.getAttribute('height'))
	if (width > 0 && height > 0) {
		return width / height
	}

	return box.width > 0 && box.height > 0 ? box.width / box.height : 1
}
