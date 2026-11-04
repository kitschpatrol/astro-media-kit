/** The wrapper `<Zoomer>` renders around content that can be lifted. */
export const itemSelector = '.amk-zoom'

/**
 * A text link `<ZoomLink>` renders, whose media is in a `<template>` inside it,
 * for the viewer alone.
 */
const linkSelector = '.amk-zoom-link'

/** The media of each link item that is in use, from a warm-up to a lift. */
const instances = new WeakMap<HTMLElement, Element>()

/** The viewer's dialog, which handles clicks on anything that travels into it. */
export const viewerSelector = '.amk-lightbox'

/**
 * Regions that run their own pointer UI, whose parts the lightbox can't see:
 * the player's controls, native media controls, and embedded documents.
 */
const regions = [
	'[data-interactive]',
	'[data-zoom-interactive]',
	'[data-click-to-play]:not([data-in-lightbox])',
	'audio[controls]',
	'iframe',
	'video[controls]',
]

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
	'[data-zoom-interactive]',
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
 * The caption to copy beside an item's content: its figure's, or, for a link,
 * the one rendered into its template.
 */
export function captionOf(item: HTMLElement): Element | undefined {
	return isLinkItem(item)
		? (templateOf(item)?.content.querySelector('figcaption') ?? undefined)
		: (item.closest('figure')?.querySelector(':scope > figcaption') ?? undefined)
}

/**
 * The media a link item opens, instantiated from its template on first use, and
 * kept from a hover that warms it to the lift that shows it. Released once it
 * has gone, for a fresh one next time.
 */
function instanceOf(item: HTMLElement): Element | undefined {
	let instance = instances.get(item)
	if (instance === undefined) {
		const content = templateOf(item)?.content.firstElementChild
		if (content === null || content === undefined) {
			return undefined
		}

		instance = document.importNode(content, true)
		instances.set(item, instance)
	}

	return instance
}

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
					(node.matches('[data-interactive], [data-zoom-interactive]') &&
						node.querySelector('audio, video') !== null)))
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

/** Whether `item` is a text link, whose media isn't in the page. */
export function isLinkItem(item: Element): boolean {
	return item.matches(linkSelector)
}

/** Whether a link leaves clicks to the browser: a download, or another target. */
export function isNativeLink(item: HTMLElement): boolean {
	return (
		item instanceof HTMLAnchorElement &&
		(item.hasAttribute('download') || (item.target !== '' && item.target !== '_self'))
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
 * running animations, and returns true. Elsewhere a plain insertion still keeps
 * media playing, as long as the moved element is laid out again in the same
 * task, and returns false, since custom elements in the node start over.
 */
export function move(parent: Element, node: Element, reference?: ChildNode): boolean {
	const before = reference?.parentNode === parent ? reference : undefined
	if ('moveBefore' in parent) {
		try {
			// eslint-disable-next-line unicorn/no-null -- The DOM API takes null to mean "append"
			parent.moveBefore(node, before ?? null)
			return true
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

	return false
}

/** Forget a link item's media, so that its next use starts afresh. */
export function releaseInstance(item: HTMLElement) {
	instances.delete(item)
}

/**
 * The element whose box shows a subject: the visible one of the elements the
 * components mark `data-media` (a themed picture's `<img>`, a player's
 * container), or the first of them while the subject isn't in the document yet,
 * as a link's media isn't, or else a `<picture>`'s `<img>`, or the subject
 * itself.
 */
export function rendered(subject: Element): Element {
	const marked = [...subject.querySelectorAll('[data-media]')]
	const shown =
		marked.find((element) => element.checkVisibility()) ??
		(subject.isConnected ? undefined : marked[0])
	return (
		shown ??
		(subject instanceof HTMLPictureElement ? (subject.querySelector('img') ?? subject) : subject)
	)
}

/**
 * The original subject: the item's first child, never its temporary page
 * preview, or a link's instantiated media.
 */
export function subjectOf(item: HTMLElement): Element | undefined {
	if (Object.hasOwn(item.dataset, 'lifted')) {
		return undefined
	}

	return isLinkItem(item) ? instanceOf(item) : (item.firstElementChild ?? undefined)
}

function templateOf(item: HTMLElement): HTMLTemplateElement | undefined {
	return item.querySelector<HTMLTemplateElement>(':scope > template') ?? undefined
}
