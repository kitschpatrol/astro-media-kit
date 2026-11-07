import {
	interactiveSelector,
	isItem,
	isLinkItem,
	isNativeLink,
	isWithin,
	itemSelector,
	rendered,
	subjectOf,
	viewerSelector,
} from './dom'
import { warmLink } from './link'
import { isClickFromDrag } from './motion'
import { closePopups, settlePopups } from './player-controls'
import { fittedWidth } from './prepare'
import { closeViewer, openViewer } from './viewer'
import { releaseWarmup, warmImage } from './warm-image'

type Intent = { subject: Element; timer: ReturnType<typeof setTimeout> }

/** How long a pointer rests on an item before its image is warmed. */
const hoverDelay = 120

/** How long a warm-up is kept without a lift. */
const intentTimeout = 5000

const intents = new Map<HTMLElement, Intent>()
let hovered: HTMLElement | undefined
let hoverTimer: ReturnType<typeof setTimeout> | undefined
let isInstalled = false

/** Prepare the fitted image on intent without changing the visible thumbnail. */
export function prepareLightbox(item: HTMLElement) {
	const subject = subjectOf(item)
	if (subject === undefined || !item.isConnected) {
		return
	}

	// Repeated intent, such as a hover followed by focus, keeps a warm-up going
	const intent = intents.get(item)
	if (intent !== undefined) {
		clearTimeout(intent.timer)
		if (intent.subject !== subject) {
			releaseWarmup(intent.subject)
		}
	}

	if (isLinkItem(item)) {
		warmLink(subject)
	} else {
		warmImage(subject, fittedWidth(subject))
	}

	intents.set(item, { subject, timer: setTimeout(releaseIntent, intentTimeout, item) })
}

/**
 * Open an item and its gallery, lifting its original subject. Resolves to
 * `true` after the opening transition, or to `false` straight away when the
 * item has no subject or the viewer is already showing.
 *
 * @throws {SyntaxError} When the item's `data-scope` isn't a valid selector.
 */
export async function openLightbox(item: HTMLElement): Promise<boolean> {
	const subject = subjectOf(item)
	if (subject === undefined) {
		return false
	}

	// A player's open popups, such as a tooltip under the pointer or the volume
	// popover, close first, and the lift waits the few frames that takes, since
	// moving the player meanwhile crashes Chromium. Otherwise the viewer opens
	// in this very task, as WebKit's media pipeline needs
	if (closePopups(subject)) {
		await settlePopups(subject)
	}

	const items = galleryOf(item)
	const isOpened = await openViewer(items, items.indexOf(item), openLightbox)
	releaseIntent(item)
	return isOpened
}

/** Close the viewer; pass true to restore synchronously before replacing a page. */
export async function closeLightbox(immediate = false): Promise<void> {
	await closeViewer(immediate)
}

/**
 * Enhance every item on the page through listeners on the document, so the
 * items a client-side router swaps in are covered too. The components render
 * the items' semantics, so nothing is written to the page here.
 */
export function installLightbox() {
	if (isInstalled) {
		return
	}

	isInstalled = true
	// Ahead of the page's own click handlers, such as a client-side router's,
	// as a listener on the item itself would be
	document.addEventListener('click', handleClick, { capture: true })
	document.addEventListener('keydown', handleKeydown)
	document.addEventListener('pointerover', handlePointerover)
	document.addEventListener('pointerout', handlePointerout)
	document.addEventListener('focusin', handleFocusin)
	document.addEventListener('focusout', handleFocusout)
	document.addEventListener('astro:before-swap', () => {
		for (const item of intents.keys()) {
			releaseIntent(item)
		}

		void closeLightbox(true)
	})
}

function handleClick(event: MouseEvent) {
	if (!isOrdinaryClick(event)) {
		return
	}

	// The composed path reaches through shadow roots, such as a media element's
	// own controls, where closest() stops
	const path = event.composedPath()
	// The viewer handles the openers that travel into it with their item, and
	// the click that ends a drag of an embedded carousel is the drag's
	if (
		isClickFromDrag() ||
		path.some((node) => node instanceof Element && node.matches(viewerSelector))
	) {
		return
	}

	const at = path.findIndex(
		(node) => node instanceof HTMLElement && Object.hasOwn(node.dataset, 'zoomOpen'),
	)
	if (at !== -1) {
		const item = path.slice(at + 1).find(isItem)
		if (item !== undefined) {
			event.preventDefault()
			const opener = path[at]
			// A pointer-opened dialog must not restore keyboard-visible focus to
			// this button after Escape, which also reopens its tooltip. Keyboard
			// and virtual clicks keep normal focus restoration.
			if (isPointerClick(event) && opener instanceof HTMLElement) {
				opener.blur()
			}

			void openLightbox(item)
		}

		return
	}

	const item = path.find(isItem)
	if (item !== undefined) {
		if (!isWithin(event, interactiveSelector, item) && !isNativeLink(item)) {
			event.preventDefault()
			// As with the opener button: a pointer-opened dialog must not restore
			// keyboard-visible focus to the item after Escape, which would leave
			// its indicator in the active state
			if (isPointerClick(event)) {
				item.blur()
			}

			void openLightbox(item)
		}

		return
	}

	// An embedded carousel's track captures the pointer for a possible drag, so
	// a click there lands on the track: the item is found under the point instead
	if (!(event.target instanceof Element) || !event.target.matches('.amk-carousel-track')) {
		return
	}

	const stack = document.elementsFromPoint(event.clientX, event.clientY)
	const depth = stack.findIndex((node) => isItem(node))
	const under = stack[depth]
	if (
		!isItem(under) ||
		isNativeLink(under) ||
		stack.slice(0, depth).some((node) => node.matches(interactiveSelector))
	) {
		return
	}

	event.preventDefault()
	void openLightbox(under)
}

/**
 * Enter and Space open an item rendered as a button; a link opens from its
 * click.
 */
function handleKeydown(event: KeyboardEvent) {
	const item = event.target ?? undefined
	if (
		(event.key !== 'Enter' && event.key !== ' ') ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		!isItem(item) ||
		item instanceof HTMLAnchorElement ||
		Object.hasOwn(item.dataset, 'zoomInteractive')
	) {
		return
	}

	event.preventDefault()
	void openLightbox(item)
}

function handleFocusin(event: FocusEvent) {
	const item = itemOf(event.target ?? undefined)
	if (item !== undefined) {
		prepareLightbox(item)
	}
}

function handleFocusout(event: FocusEvent) {
	const item = itemOf(event.target ?? undefined)
	if (item !== undefined) {
		queueMicrotask(() => {
			cancelIntent(item)
		})
	}
}

function handlePointerover(event: PointerEvent) {
	if (event.pointerType === 'touch') {
		return
	}

	const item = itemOf(event.target ?? undefined)
	if (item === hovered) {
		return
	}

	clearTimeout(hoverTimer)
	hovered = item
	if (item !== undefined) {
		hoverTimer = setTimeout(prepareLightbox, hoverDelay, item)
	}
}

function handlePointerout(event: PointerEvent) {
	const item = hovered
	if (
		item === undefined ||
		(event.relatedTarget instanceof Node && item.contains(event.relatedTarget))
	) {
		return
	}

	clearTimeout(hoverTimer)
	hovered = undefined
	cancelIntent(item)
}

/** Release a warm-up once neither the pointer nor focus is on the item. */
function cancelIntent(item: HTMLElement) {
	if (!item.matches(':hover, :focus-within')) {
		releaseIntent(item)
	}
}

/** The item `target` is in, if it is in one in the page. */
function itemOf(target: EventTarget | undefined): HTMLElement | undefined {
	const item =
		target instanceof Element ? (target.closest<HTMLElement>(itemSelector) ?? undefined) : undefined
	return isItem(item) ? item : undefined
}

function isOrdinaryClick(event: MouseEvent): boolean {
	return (
		!event.defaultPrevented &&
		event.button === 0 &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.shiftKey &&
		!event.altKey
	)
}

/**
 * Whether a pointer made the click, rather than a key or a script. Firefox
 * gives the click that Enter makes on a link a `detail` of 1, so only the
 * pointer type tells them apart.
 */
function isPointerClick(event: MouseEvent): boolean {
	return event instanceof PointerEvent && event.pointerType !== ''
}

function releaseIntent(item: HTMLElement) {
	const intent = intents.get(item)
	if (intent === undefined) {
		return
	}

	clearTimeout(intent.timer)
	releaseWarmup(intent.subject)
	intents.delete(item)
}

/**
 * The items that open together with `item`, in document order: those sharing
 * its gallery name, within the nearest ancestor matching its scope if it has
 * one. Unnamed, unscoped items open alone.
 */
function galleryOf(item: HTMLElement): HTMLElement[] {
	const name = item.dataset.gallery ?? ''
	const { scope } = item.dataset
	const scopeRoot = scope === undefined ? undefined : scopeOf(item, scope)
	if (scope !== undefined && scopeRoot === undefined) {
		console.warn(
			`[astro-media-kit] zoomScope "${scope}" matches no ancestor of this item, so it opens alone.`,
			item,
		)
		return [item]
	}

	if (name === '' && scopeRoot === undefined) {
		return [item]
	}

	const container = scopeRoot ?? document
	return [...container.querySelectorAll<HTMLElement>(itemSelector)].filter((candidate) => {
		// A lifted subject is on its way home from the viewer, and will be back
		const isShowing =
			Object.hasOwn(candidate.dataset, 'lifted') ||
			(isLinkItem(candidate)
				? candidate.checkVisibility({ visibilityProperty: true })
				: isSubjectShowing(candidate))
		return (
			candidate === item ||
			((candidate.dataset.gallery ?? '') === name &&
				isShowing &&
				isItem(candidate) &&
				(scope === undefined || candidate.parentElement?.closest(scope) === scopeRoot))
		)
	})
}

function isSubjectShowing(item: HTMLElement): boolean {
	const subject = subjectOf(item)
	return subject !== undefined && rendered(subject).checkVisibility({ visibilityProperty: true })
}

/** The nearest ancestor of `item` that matches its scope selector. */
function scopeOf(item: HTMLElement, scope: string): Element | undefined {
	try {
		return item.parentElement?.closest(scope) ?? undefined
	} catch (error) {
		throw new SyntaxError(`[astro-media-kit] zoomScope "${scope}" is not a valid CSS selector.`, {
			cause: error,
		})
	}
}
