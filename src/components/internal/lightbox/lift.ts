import type { Box, Fit } from './geometry'
import type { Lift, Margins, Measurement, Point, Slide, WrapperSize } from './types'
import { isPlainMarkup } from './clone-placeholder'
import { releaseControlPreview, retainControlPreview } from './control-preview'
import { anonymize, isLinkItem, move, releaseInstance, rendered, subjectOf } from './dom'
import { lengthOf } from './geometry'
import { releaseImagePreview, retainImage, returnImagePreview } from './image-preview'
import { isVectorImage, ratioOf } from './media'
import { retainPictureThemes } from './picture-theme'
import { createPlaceholder, placePlaceholder, removePlaceholder } from './placeholder'
import { adoptControls, closePopups, refreshPopups, releaseControls } from './player-controls'
import { prepareSlideImage, releasePreparation, restorePreparedClone } from './prepare'
import { releaseWarmup } from './warm-image'

/**
 * How long, in ms, a returning subject stays covered at most, should its image
 * never decode.
 */
const returnDecodeLimit = 1000

/**
 * How to finish each return still under way, by item: its subject is back in
 * the page, under its copy, until it can draw itself.
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
		if (lift.kind !== 'move') {
			lift.releasePictureThemes()
			releaseImagePreview(lift.subject)
			// A link's media, like a copy of what stays in the page, is for the
			// viewer alone: it goes away, and the next use starts afresh
			if (lift.kind === 'link') {
				releaseControls(lift.subject)
				releaseInstance(item)
			}

			lift.subject.remove()
			releasePreparation(lift.subject, false)
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

		lift.releaseMargins()
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

/** Mount a responsive copy, a link instance, or the original live content. */
export function liftSlide(slide: Slide, measurement: Measurement) {
	if (slide.lift !== undefined) {
		return
	}

	// A copy still covering the subject from its last return makes way for the new one
	returns.get(measurement.item)?.()

	const { item, kind } = measurement
	if (kind === 'copy') {
		const original = measurement.subject
		const thumbnail = rendered(original)
		const subject = copyForViewer(original, slide.frame.offsetWidth)
		const releasePictureThemes = retainPictureThemes(subject, item, () => {
			prepareSlideImage(slide)
		})
		slide.lift = { ...measurement, kind, original, releasePictureThemes, subject }
		slide.layer.append(subject)
		retainImage(subject, slide.layer, thumbnail)
		item.dataset.lifted = 'copy'
		releaseWarmup(original)
		return
	}

	const { subject } = measurement
	if (measurement.kind === 'move') {
		retainControlPreview(item, subject)
		const placeholder = createPlaceholder(item, subject)
		retainImage(subject, slide.layer)
		const releasePictureThemes = retainPictureThemes(subject, item)
		const hadStyle = item.hasAttribute('style')
		const { hasOwnHeight, hold } = holdOf(item, subject, measurement.wrapper)
		slide.lift = {
			...measurement,
			hadStyle,
			nextSibling: subject.nextSibling ?? undefined,
			placeholder: placeholder?.element,
			placeholderBox: placeholder?.box,
			probe: undefined,
			releaseMargins: holdMargins(item, measurement.margins, hasOwnHeight),
			releasePictureThemes,
		}
		item.dataset.lifted = hold
		moveIntoSlide(slide, subject)
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
	} else {
		retainImage(subject, slide.layer)
		slide.lift = {
			...measurement,
			kind: 'link',
			releasePictureThemes: retainPictureThemes(subject, item),
		}
		item.dataset.lifted = ''
		moveIntoSlide(slide, subject)
		// A link's media only connects on first use.
		subject.dispatchEvent(new Event('amk-media-connected', { bubbles: true }))
	}

	releaseWarmup(subject)
}

function moveIntoSlide(slide: Slide, subject: Element) {
	// A popup still on its way out can't be carried by a move in this task
	if (closePopups(subject)) {
		refreshPopups(subject)
	}

	if (!move(slide.layer, subject)) {
		refreshPopups(subject)
	}

	adoptControls(subject)
}

/**
 * Built-in photos own their viewer copy. Standalone SVGs also keep their
 * original in place to avoid a repaint at the page's zoom level on iPadOS.
 */
function staysInPage(item: HTMLElement, subject: Element): boolean {
	if (subject.matches('[data-zoom-photo]')) {
		return true
	}

	const visible = rendered(subject)
	return (
		item.dataset.placeholder !== 'none' &&
		visible instanceof HTMLImageElement &&
		isVectorImage(visible) &&
		isPlainMarkup(subject)
	)
}

/** A copy of ordinary markup for the viewer, without the original's identity. */
function copyForViewer(subject: Element, width: number): Element {
	// Assemble in an inert document so handlers and page-sized source hints
	// cannot start work before the copy is mounted in the dialog.
	const inert = document.createElement('template').content.ownerDocument
	const copy = inert.importNode(subject, true)
	anonymize(copy)
	for (const element of [copy, ...copy.querySelectorAll('*')]) {
		// Set the initial hint before connecting any image. A hidden theme
		// branch can wait until it becomes the displayed picture.
		if (element instanceof HTMLImageElement) {
			element.loading = 'lazy'
		}

		if (width > 0 && element.matches('img, source')) {
			element.setAttribute('sizes', `${width}px`)
		}

		for (const name of element.getAttributeNames()) {
			if (name.startsWith('on')) {
				element.removeAttribute(name)
			}
		}
	}

	return copy
}

/**
 * Take a returning subject's page copy and control preview away once the
 * subject can draw itself. WebKit stops holding a player's poster decoded while
 * the player is out of view, and once it is back draws nothing for a moment,
 * which shows the player's black, or on iOS a draft of it in one corner. So a
 * player showing its poster stays covered until the poster is decoded again.
 *
 * An image can change candidates as it gets its own `sizes` back. Chromium
 * takes the largest one in its memory cache, which outlasts a reload, and not
 * at every selection: an image the page has shown at full size starts there,
 * steps down for the viewer, and back up on return, drawing nothing until that
 * is decoded. So an image stays covered until the candidate it settles on is.
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

		delete item.dataset.returning
		removePlaceholder(placeholder)
		releaseControlPreview(subject)
	}

	const poster = subject.querySelector<HTMLImageElement>(':scope media-poster[data-visible] img')
	const visible = rendered(subject)
	const image = poster ?? (visible instanceof HTMLImageElement ? visible : undefined)
	if (placeholder === undefined || image === undefined) {
		finish()
		return
	}

	// Positioned, as while lifted, for the copy laid over the subject
	item.dataset.returning = ''
	returns.set(item, finish)
	const uncoverDecoded = async () => {
		if (image !== poster) {
			// It selects its candidate once the task that returned it is over
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => {
					resolve()
				})
			})
		}

		try {
			await image.decode()
		} catch {
			// An image that can't be decoded draws as it is
		}

		requestAnimationFrame(finish)
	}

	void uncoverDecoded()
	setTimeout(finish, returnDecodeLimit)
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
	if (lift.kind !== 'move' || item.dataset.lifted !== 'size' || lift.probe !== undefined) {
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
	anonymize(probe)
	for (const element of [probe, ...probe.querySelectorAll('img')]) {
		if (element instanceof HTMLImageElement) {
			element.alt = ''
		}
	}

	return probe
}

/** How a wrapper's space is held while its subject is lifted. */
type Hold = '' | 'ratio' | 'size'

/**
 * Measure the wrapper without its subject to decide how to hold its space, and
 * whether its height is its own, not its content's. One that keeps its width
 * gets it from its container, so the subject's aspect ratio holds the height
 * and the space follows a resize. One that collapses is sized by its content,
 * so its measured size holds. One that keeps both needs no hold. The subject is
 * taken out of flow for the measurement rather than out of the wrapper: it
 * stays put, and the wrapper's layout is current, which it isn't in Chromium
 * right after a state-preserving move out of it.
 */
function holdOf(
	item: HTMLElement,
	subject: Element,
	wrapper: WrapperSize,
): { hasOwnHeight: boolean; hold: Hold } {
	const width = lengthOf(wrapper.width)
	const height = lengthOf(wrapper.height)
	if (!Number.isFinite(width) || !Number.isFinite(height)) {
		return { hasOwnHeight: false, hold: 'size' }
	}

	const style =
		subject instanceof HTMLElement || subject instanceof SVGElement ? subject.style : undefined
	const { emptyWidth, emptyHeight } = withScrollKept(item, () => {
		const restore = style === undefined ? undefined : override(style, 'position', 'absolute')
		const empty = getComputedStyle(item)
		const measured = { emptyWidth: lengthOf(empty.width), emptyHeight: lengthOf(empty.height) }
		restore?.()
		return measured
	})

	const hasOwnHeight = Math.abs(emptyHeight - height) < 0.5
	if (!(Math.abs(emptyWidth - width) < 0.5)) {
		return { hasOwnHeight, hold: 'size' }
	}

	return { hasOwnHeight, hold: hasOwnHeight ? '' : 'ratio' }
}

/**
 * Set an inline style that overrides any other, and return how to put back what
 * was there.
 */
function override(style: CSSStyleDeclaration, property: string, value: string): () => void {
	const previous = style.getPropertyValue(property)
	const priority = style.getPropertyPriority(property)
	style.setProperty(property, value, 'important')
	return () => {
		if (previous === '') {
			style.removeProperty(property)
		} else {
			style.setProperty(property, previous, priority)
		}
	}
}

/**
 * Keep an item where its subject's margins had it. A block's margins collapse
 * with those of the content at its edges, which then lie outside it: they would
 * leave with the subject, and the item and all that follows it would move up
 * the page. So the item takes them as its own, and what is returned puts its
 * own back. A margin below only passes an item that gets its height from its
 * content.
 */
function holdMargins(item: HTMLElement, margins: Margins, hasOwnHeight: boolean): () => void {
	const releases: Array<() => void> = []
	for (const edge of ['top', 'bottom'] as const) {
		const margin = margins[edge]
		if (margin === undefined || (edge === 'bottom' && hasOwnHeight)) {
			continue
		}

		const { negative, positive } = margin
		if (positive > 0 && negative < 0) {
			// A later collapse with a sibling or ancestor must still see both
			// extrema. An empty block's own margins adjoin across its box.
			const spacer = document.createElement('span')
			spacer.dataset.amkMargin = ''
			spacer.style.setProperty('--amk-lightbox-negative-margin', `${negative}px`)
			if (edge === 'top') {
				item.before(spacer)
			} else {
				item.after(spacer)
			}

			releases.push(() => {
				spacer.remove()
			})
		}

		releases.push(override(item.style, `margin-${edge}`, `${positive > 0 ? positive : negative}px`))
	}

	return () => {
		for (const release of releases) {
			release()
		}
	}
}

/**
 * The margin an item needs at one edge to stay where it is without its subject:
 * its own, collapsed with those the subject and its content put past that edge.
 * Undefined when they put none past it, as with an item that isn't a block, or
 * has padding or a border there.
 */
function passingMargin(
	item: HTMLElement,
	style: CSSStyleDeclaration,
	subject: Element,
	edge: Edge,
): Margins[Edge] {
	const [own, padding, border] =
		edge === 'top'
			? [style.marginTop, style.paddingTop, style.borderTopWidth]
			: [style.marginBottom, style.paddingBottom, style.borderBottomWidth]
	if (style.display !== 'block' || lengthOf(padding) !== 0 || lengthOf(border) !== 0) {
		return undefined
	}

	const margins: number[] = []
	collectMargins(subject, edge, layoutEdge(item, edge), margins)
	if (margins.every((margin) => margin === 0)) {
		return undefined
	}

	// Adjoining margins collapse to the largest, less the most negative
	const adjoining = [lengthOf(own), ...margins]
	const positive = Math.max(0, ...adjoining)
	const negative = Math.min(0, ...adjoining)
	return Number.isFinite(positive) && Number.isFinite(negative) ? { negative, positive } : undefined
}

type Edge = 'bottom' | 'top'

/**
 * Collect the margins that `element` and its content have at the edge of their
 * item that lies at `line`. A margin lies outside the item when its box sits
 * right at the item's edge: inside, it would hold the box off. Only the first
 * boxes in flow from that edge can, so the search ends at one with a height,
 * which is what true reports.
 */
function collectMargins(element: Element, edge: Edge, line: number, margins: number[]): boolean {
	const style = getComputedStyle(element)
	if (
		style.display === 'none' ||
		style.position === 'absolute' ||
		style.position === 'fixed' ||
		style.float !== 'none'
	) {
		return false
	}

	if (!(element instanceof HTMLElement)) {
		return true
	}

	// An inline box around a block has its content's height in some browsers
	// only, and one without a box has none: either is looked through
	const isBox = style.display !== 'contents' && element.offsetHeight > 0
	if (isBox) {
		if (layoutEdge(element, edge) !== line) {
			return true
		}

		if (style.display !== 'inline') {
			margins.push(lengthOf(edge === 'top' ? style.marginTop : style.marginBottom))
		}
	}

	const children = edge === 'top' ? [...element.children] : [...element.children].toReversed()
	for (const child of children) {
		if (collectMargins(child, edge, line, margins)) {
			return true
		}
	}

	return isBox
}

/**
 * How far down the page an element's border box starts or ends, as laid out: a
 * transform, such as a hover zoom, draws it elsewhere without moving it.
 */
function layoutEdge(element: HTMLElement, edge: Edge): number {
	let top = element.offsetTop
	for (
		let parent = element.offsetParent;
		parent instanceof HTMLElement;
		parent = parent.offsetParent
	) {
		top += parent.offsetTop + parent.clientTop
	}

	return edge === 'top' ? top : top + element.offsetHeight
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
	const geometry = thumbnailGeometry(visible)
	const { target } = geometry
	const measurement = {
		...geometry,
		home: { height: home.height, width: home.width, x: home.x, y: home.y },
		item,
		offset: { ...target, x: target.x - home.x, y: target.y - home.y },
		ratio: ratioOf(visible, target),
		subject,
	}
	if (staysInPage(item, subject)) {
		return { ...measurement, kind: 'copy' }
	}

	const style = getComputedStyle(item)
	return {
		...measurement,
		kind: 'move',
		margins: {
			bottom: passingMargin(item, style, subject, 'bottom'),
			top: passingMargin(item, style, subject, 'top'),
		},
		wrapper: { width: style.width, height: style.height },
	}
}

/** The crop and border box to animate from or return to in the page. */
export function thumbnailGeometry(visible: Element) {
	const { height, width, x, y } = visible.getBoundingClientRect()
	const target = { height, width, x, y }
	const style = getComputedStyle(visible)
	return {
		fit: fitOf(visible, style.objectFit),
		position: positionOf(style.objectPosition),
		radius: radiusOf(style.borderTopLeftRadius, target),
		target,
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
		kind: 'link',
		offset: { ...box, x: 0, y: 0 },
		position: { x: 0.5, y: 0.5 },
		radius: 0,
		ratio: ratioOf(rendered(subject), { height: 0, width: 0, x: 0, y: 0 }),
		subject,
		target: box,
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
