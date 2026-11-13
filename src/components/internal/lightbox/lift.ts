import type { Box, Fit } from './geometry'
import type { Lift, Measurement, Point, Slide } from './types'
import { isPlainMarkup } from './clone-placeholder'
import { releaseControlPreview, retainControlPreview } from './control-preview'
import { isLinkItem, move, releaseInstance, rendered, subjectOf } from './dom'
import { lengthOf } from './geometry'
import { releaseImagePreview, retainImage, returnImagePreview } from './image-preview'
import { ratioOf } from './media'
import { retainPictureThemes } from './picture-theme'
import { createPlaceholder, placePlaceholder, removePlaceholder } from './placeholder'
import { adoptControls, closePopups, refreshPopups, releaseControls } from './player-controls'
import { releasePreparation, restorePreparedClone } from './prepare'
import { releaseWarmup } from './warm-image'

/**
 * How long, in ms, a returning player stays covered at most, should its poster
 * never decode.
 */
const posterDecodeLimit = 1000

/**
 * How to finish each return still under way, by item: its player is back in the
 * page, under its copy, until it can draw itself.
 */
const returns = new WeakMap<HTMLElement, () => void>()

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
			lift.releasePictureThemes()
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

		lift.releasePictureThemes()
		lift.probe?.remove()
		uncover(item, lift.subject, lift.placeholder)

		item.style.removeProperty('--amk-lightbox-placeholder-width')
		item.style.removeProperty('--amk-lightbox-placeholder-height')
		item.style.removeProperty('--amk-lightbox-placeholder-ratio')
		if (!lift.hadStyle && item.style.length === 0) {
			item.removeAttribute('style')
		}

		releasePreparation(lift.subject)
		delete item.dataset.lifted
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

	// A copy still covering the subject from its last return makes way for the new one
	returns.get(measurement.item)?.()

	const { item, subject } = measurement
	// A link's media was never in the page: nothing holds its place or stands in
	const isLink = isLinkItem(item)
	if (!isLink) {
		retainControlPreview(item, subject)
	}

	const placeholder = isLink ? undefined : createPlaceholder(item, subject)
	retainImage(subject, slide.layer)
	slide.lift = {
		...measurement,
		hadStyle: item.hasAttribute('style'),
		nextSibling: subject.nextSibling ?? undefined,
		placeholder: placeholder?.element,
		placeholderBox: placeholder?.box,
		probe: undefined,
		releasePictureThemes: retainPictureThemes(subject, item),
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

/**
 * Take a returning subject's page copy and control preview away once the
 * subject can draw itself. WebKit stops holding a player's poster decoded while
 * the player is out of view, and once it is back draws nothing for a moment,
 * which shows the player's black, or on iOS a draft of it in one corner. So a
 * player showing its poster stays covered until the poster is decoded again.
 */
function uncover(item: HTMLElement, subject: Element, placeholder: HTMLElement | undefined) {
	let isDone = false
	const finish = () => {
		if (isDone) {
			return
		}

		isDone = true
		if (returns.get(item) === finish) {
			returns.delete(item)
		}

		delete item.dataset.playerReturning
		removePlaceholder(placeholder)
		releaseControlPreview(subject)
	}

	const poster = subject.querySelector<HTMLImageElement>(':scope media-poster[data-visible] img')
	if (placeholder === undefined || poster === null) {
		finish()
		return
	}

	// Positioned, as while lifted, for the copy laid over the player
	item.dataset.playerReturning = ''
	returns.set(item, finish)
	const uncoverDecoded = async () => {
		try {
			await poster.decode()
		} catch {
			// A poster that can't be decoded draws as it is
		}

		requestAnimationFrame(finish)
	}

	void uncoverDecoded()
	setTimeout(finish, posterDecodeLimit)
}

/**
 * Let an item that holds its measured size follow the page again, after the
 * page has been laid out anew, as when the viewport is resized or turned. Its
 * size came from its subject, which is away, so an invisible stand-in for the
 * subject's box goes in its place: the item takes the size the subject would
 * give it now, its preview keeps to it, and the way home leads there. A subject
 * that can't be stood in for keeps its measured size.
 */
export function followLayout(lift: Lift) {
	const { item } = lift
	if (item.dataset.lifted !== 'size' || lift.probe !== undefined) {
		return
	}

	const probe = createProbe(lift)
	if (probe === undefined) {
		return
	}

	probe.dataset.amkProbe = ''
	probe.ariaHidden = 'true'
	probe.inert = true
	const { nextSibling } = lift
	item.insertBefore(probe, nextSibling?.parentNode === item ? nextSibling : item.firstChild)
	item.dataset.lifted = ''
	const box = item.getBoundingClientRect()
	if (box.width <= 0 || box.height <= 0) {
		// Not a box the subject could have given it, so the measured size stays
		probe.remove()
		item.dataset.lifted = 'size'
		return
	}

	lift.probe = probe
	item.style.removeProperty('--amk-lightbox-placeholder-width')
	item.style.removeProperty('--amk-lightbox-placeholder-height')
	if (lift.placeholder !== undefined && lift.placeholderBox !== undefined) {
		placePlaceholder(item, { box: lift.placeholderBox, element: lift.placeholder }, lift.home, true)
	}
}

/**
 * An element that takes the room the subject takes in the page, with nothing to
 * show: a copy of ordinary markup, or, for the kit's player, boxes with the
 * width and aspect ratio its container was rendered with. Undefined for a
 * subject neither can stand in for, such as an embed.
 */
function createProbe(lift: Lift): HTMLElement | undefined {
	const { subject } = lift
	const container = subject.querySelector<HTMLElement>('media-container[data-media]')
	if (container !== null && subject instanceof HTMLElement) {
		// Never a copy of the player itself, which would start a second one
		const probe = subject.cloneNode(false) as HTMLElement
		const box = document.createElement('div')
		Object.assign(box.style, {
			aspectRatio:
				container.style.aspectRatio === '' ? String(lift.ratio) : container.style.aspectRatio,
			display: 'block',
			maxWidth: '100%',
			width: container.style.width,
		})
		probe.append(box)
		probe.removeAttribute('id')
		return probe
	}

	if (!isPlainMarkup(subject)) {
		return undefined
	}

	const probe = subject.cloneNode(true)
	if (!(probe instanceof HTMLElement)) {
		return undefined
	}

	// The copy is laid out as the subject was in the page, not as the viewer
	// has prepared it
	restorePreparedClone(subject, probe)
	for (const element of [probe, ...probe.querySelectorAll('*')]) {
		element.removeAttribute('id')
		element.removeAttribute('name')
		if (element instanceof HTMLImageElement) {
			element.alt = ''
		}
	}

	return probe
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
