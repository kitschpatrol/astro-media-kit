/**
 * The kit's Video.js player travels into the viewer whole, so its own control
 * bar is floated over the viewer rather than building a second player. The bar
 * is a manual popover: the top layer escapes the slide's zoom transform, and
 * its entrance and exit are CSS transitions, so the popover attribute stays on
 * a bar that is hidden until its player goes back to the page.
 */

type Bar = {
	activity: ReturnType<typeof createControlsActivity> | undefined
	controls: HTMLElement
}

/** A Video.js popup, which closes on request. */
type Popup = Element & { close?: (reason?: string) => void }

/** The bars that are floated or on their way out, by their player's subject. */
const bars = new Map<Element, Bar>()

/** The control levels of lifted players that took the viewer's, by subject. */
const levels = new Map<Element, string>()

/** Playback gestures suspended while the lightbox owns the media surface. */
const gestures = new WeakMap<Element, Element[]>()

/**
 * Give a lifted player the viewer's control level: a minimal player's full bar,
 * which the component renders hidden on the page, comes out, while a player
 * without controls stays without.
 */
export function adoptControls(subject: Element) {
	const player = subject.querySelector<HTMLElement>(':scope video-player')
	if (player === null) {
		return
	}

	levels.set(subject, player.dataset.controls ?? 'none')
	player.dataset.inLightbox = ''
	const active = [...player.querySelectorAll('media-gesture:not([disabled])')]
	gestures.set(subject, active)
	for (const gesture of active) {
		gesture.setAttribute('disabled', '')
	}

	if (player.dataset.controls === 'minimal') {
		player.dataset.controls = 'lightbox'
	}
}

/** A popup of a player's controls that is open, or on its way in or out. */
const popupSelector = '[data-popup]:is([data-open], [data-starting-style], [data-ending-style])'

/**
 * Close the popups open in a player's controls, tooltips included, before the
 * player moves, and say whether any was: a popup in the top layer can't come
 * along, and Chromium crashes when a state-preserving move carries one.
 */
export function closePopups(subject: Element): boolean {
	const popups = subject.querySelectorAll<Popup>(popupSelector)
	for (const popup of popups) {
		popup.close?.('imperative-action')
	}

	return popups.length > 0
}

/** Suppress tooltips reopened by pointer-focus restoration after a move. */
export function closeInactiveTooltips(subject: Element) {
	for (const tooltip of subject.querySelectorAll<Popup>('media-tooltip')) {
		const id = tooltip.getAttribute('trigger') ?? ''
		const trigger =
			id === '' ? undefined : subject.ownerDocument.querySelector(`#${CSS.escape(id)}`)
		if (trigger?.matches(':hover, :focus-visible') !== true) {
			tooltip.close?.('imperative-action')
		}
	}
}

/**
 * Replace the popups in a player's controls with fresh copies, after a move
 * that started its custom elements over: a Video.js popup set up again on
 * connection keeps the trigger listeners of its first life, and the two then
 * open and close it against each other. The copies start once; the originals
 * are destroyed, listeners and all.
 */
export function refreshPopups(subject: Element) {
	for (const popup of subject.querySelectorAll('[data-popup]')) {
		popup.replaceWith(popup.cloneNode(true))
	}
}

/**
 * Wait for the popups in a player's controls to finish closing and leave the
 * top layer, which Video.js takes a few frames over, reflecting each step on
 * the next.
 */
export async function settlePopups(subject: Element): Promise<void> {
	const isUnsettled = () => subject.querySelector(`${popupSelector}, :popover-open`) !== null
	for (let frame = 0; frame < 10 && (frame < 2 || isUnsettled()); frame++) {
		await new Promise((resolve) => {
			requestAnimationFrame(resolve)
		})
	}
}

/**
 * Track whether the viewer is in use, so the floated controls can hide.
 * Activity covers the whole viewer, but the pointer over the controls or a
 * popup of theirs, focus, and dragging keep the controls visible.
 */
export function createControlsActivity(root: HTMLElement): {
	destroy: () => void
	markActive: () => void
	setControls: (element: HTMLElement | undefined) => void
} {
	let controls: HTMLElement | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	const pointers = new Set<number>()
	const controller = new AbortController()
	const { signal } = controller
	const clearTimer = (): void => {
		clearTimeout(timer)
		timer = undefined
	}

	const markActive = (): void => {
		clearTimer()
		if (!controls) {
			return
		}

		delete controls.dataset.userInactive
		timer = setTimeout(() => {
			// A popup of the controls, such as the volume popover, counts as
			// hovering them, as it is in the DOM
			if (
				controls &&
				controls.closest('video-player')?.hasAttribute('data-playing') !== false &&
				!controls.matches(':hover, :has([data-popup]:hover)') &&
				!controls.contains(document.activeElement) &&
				pointers.size === 0
			) {
				controls.dataset.userInactive = ''
			}
		}, 1500)
	}

	for (const event of ['pointermove', 'focusin', 'focusout', 'keydown']) {
		root.addEventListener(event, markActive, { signal })
	}

	for (const event of ['play', 'pause', 'ended']) {
		root.addEventListener(event, markActive, { capture: true, signal })
	}

	root.addEventListener(
		'pointerdown',
		(event) => {
			if (event.target instanceof Node && controls?.contains(event.target)) {
				pointers.add(event.pointerId)
			}

			markActive()
		},
		{ capture: true, signal },
	)
	for (const event of ['pointerup', 'pointercancel'] as const) {
		document.addEventListener(
			event,
			(pointerEvent) => {
				if (pointers.delete(pointerEvent.pointerId)) {
					markActive()
				}
			},
			{ signal },
		)
	}

	return {
		destroy() {
			controller.abort()
			clearTimer()
		},
		markActive,
		setControls(element) {
			controls = element
			pointers.clear()
			markActive()
		},
	}
}

/**
 * Float the control bar of the player in `subject`, if it is one, over
 * `viewer`. Any other bar on show goes away.
 */
export function floatControls(subject: Element, viewer: HTMLElement) {
	for (const [other, bar] of bars) {
		if (other !== subject) {
			hide(bar)
		}
	}

	const controls = subject.querySelector<HTMLElement>(':scope video-player .amk-controls')
	if (
		controls === null ||
		controls.closest<HTMLElement>('video-player')?.dataset.controls === 'none'
	) {
		return
	}

	const bar = bars.get(subject) ?? { activity: undefined, controls }
	bars.set(subject, bar)
	if (!controls.matches(':popover-open')) {
		// Settle the bar as a hidden popover first, without transitioning there,
		// so that showing it starts the entrance transition from its starting
		// style rather than from its in-player style
		controls.style.transition = 'none'
		controls.popover = 'manual'
		controls.getBoundingClientRect()
		controls.style.transition = ''
		controls.showPopover()
	}

	bar.activity ??= createControlsActivity(viewer)
	bar.activity.setControls(controls)
}

/** Send every floated bar away, with the popups it holds, as the viewer closes. */
export function hideControls() {
	for (const [subject, bar] of bars) {
		closePopups(subject)
		hide(bar)
	}
}

/**
 * Put a bar back in its player, at the player's own control level, where it
 * fades into place: the one in `subject`, or every bar when no subject is
 * given.
 */
export function releaseControls(subject?: Element) {
	for (const [each, level] of levels) {
		if (subject !== undefined && each !== subject) {
			continue
		}

		const player = each.querySelector<HTMLElement>(':scope video-player')
		if (player !== null) {
			player.dataset.controls = level
			delete player.dataset.inLightbox
		}

		const active = gestures.get(each) ?? []
		for (const gesture of active) {
			gesture.removeAttribute('disabled')
		}

		gestures.delete(each)

		levels.delete(each)
	}

	for (const [each, bar] of bars) {
		if (subject !== undefined && each !== subject) {
			continue
		}

		hide(bar)
		const { controls } = bar
		// Start transparent in the player, then let its normal fade reveal it.
		controls.dataset.returning = ''
		controls.removeAttribute('popover')
		controls.getBoundingClientRect()
		delete controls.dataset.returning
		bars.delete(each)
	}
}

function hide(bar: Bar) {
	bar.activity?.destroy()
	bar.activity = undefined
	if (bar.controls.matches(':popover-open')) {
		bar.controls.hidePopover()
	}
}
