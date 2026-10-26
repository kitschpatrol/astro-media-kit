/** The wrapper `<Zoomer>` renders around content that can be lifted. */
export const itemSelector = '.amk-zoom'

/** The viewer's dialog, which handles clicks on anything that travels into it. */
export const viewerSelector = '.amk-lightbox'

/**
 * Regions that run their own pointer UI, whose parts the lightbox can't see:
 * the player's controls, native media controls, and embedded documents.
 */
const regions = ['[data-interactive]', 'audio[controls]', 'iframe', 'video[controls]']

/** Controls with their own click, drag, and keyboard behavior. */
const controls = [
	'[role="button"]',
	'[role="slider"]',
	'button',
	'input',
	'label',
	'select',
	'summary',
	'textarea',
	'[contenteditable]:not([contenteditable="false"])',
]

/**
 * Elements that keep their own click and keyboard behavior when they sit inside
 * an item or a lifted subject, such as a player's controls or links.
 */
export const interactiveSelector = [...regions, 'a[href]', ...controls].join(',')

/**
 * Interactive regions, where a clearly vertical drag can still dismiss the
 * viewer, since a press there may not have landed on any control.
 */
export const regionSelector = regions.join(',')

/**
 * Controls, which keep every press, drag included. An item's own fallback link
 * gives its presses to a drag of the carousel it sits in; the click that ends a
 * drag never opens it.
 */
export const controlSelector = ['a[href]:not(.amk-zoom)', ...controls].join(',')

/** Elements that use the arrow keys themselves. */
export const arrowKeySelector = [
	'[data-interactive]',
	'[role="slider"]',
	'audio[controls]',
	'input',
	'select',
	'textarea',
	'video[controls]',
	'[contenteditable]:not([contenteditable="false"])',
].join(',')

/** Elements that take typed text, and every key with it. */
export const textEntrySelector = [
	'input',
	'select',
	'textarea',
	'[contenteditable]:not([contenteditable="false"])',
].join(',')

/**
 * Whether `event` happened inside a player, between its target and `boundary`:
 * the kit's Video.js player, a native media element, or an interactive region
 * holding one.
 */
export function isInPlayer(event: Event, boundary: Element): boolean {
	for (const node of event.composedPath()) {
		if (node === boundary) {
			return false
		}

		if (
			node instanceof HTMLMediaElement ||
			(node instanceof Element &&
				(node.matches('video-player, audio-player') ||
					(node.matches('[data-interactive]') && node.querySelector('audio, video') !== null)))
		) {
			return true
		}
	}

	return false
}

/**
 * Whether `node` is an item in the page, rather than inside a preview or the
 * viewer.
 */
export function isItem(node: EventTarget | undefined): node is HTMLElement {
	return (
		node instanceof HTMLElement &&
		node.matches(itemSelector) &&
		node.parentElement?.closest(`[data-preview], ${viewerSelector}`) === null
	)
}

/**
 * Whether `event` happened on or inside an element matching `selector`, between
 * its target and `boundary`. Unlike `closest()`, this sees into shadow roots,
 * such as a media element's own controls.
 */
export function isWithin(event: Event, selector: string, boundary: Element): boolean {
	for (const node of event.composedPath()) {
		if (node === boundary) {
			return false
		}

		if (node instanceof Element && node.matches(selector)) {
			return true
		}
	}

	return false
}

/**
 * Move `node` into `parent`, before `reference` or at the end. Uses
 * `moveBefore()` where available, which keeps iframes loaded, focus, and
 * running animations. Elsewhere a plain insertion still keeps media playing, as
 * long as the moved element is laid out again in the same task.
 */
export function move(parent: Element, node: Element, reference?: ChildNode) {
	const before = reference?.parentNode === parent ? reference : undefined
	if ('moveBefore' in parent) {
		try {
			// eslint-disable-next-line unicorn/no-null -- The DOM API takes null to mean "append"
			parent.moveBefore(node, before ?? null)
			return
		} catch (error) {
			// Thrown when parent and node are not both connected to the same
			// document, which a plain insertion handles
			if (!(error instanceof Error) || error.name !== 'HierarchyRequestError') {
				throw error
			}
		}
	}

	if (before === undefined) {
		parent.append(node)
	} else {
		before.before(node)
	}
}

/**
 * The element whose box shows a subject: the visible one of the elements the
 * components mark `data-media` (a themed picture's `<img>`, a player's
 * container), or else a `<picture>`'s `<img>`, or the subject itself.
 */
export function rendered(subject: Element): Element {
	const marked = [...subject.querySelectorAll('[data-media]')].find((element) =>
		element.checkVisibility(),
	)
	return (
		marked ??
		(subject instanceof HTMLPictureElement ? (subject.querySelector('img') ?? subject) : subject)
	)
}

/**
 * The original subject, the item's first child, never its temporary page
 * preview.
 */
export function subjectOf(item: HTMLElement): Element | undefined {
	return Object.hasOwn(item.dataset, 'lifted') ? undefined : (item.firstElementChild ?? undefined)
}
