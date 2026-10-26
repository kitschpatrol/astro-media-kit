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

/**
 * Give a lifted player the viewer's control level: a minimal player's full bar,
 * which the component renders hidden on the page, comes out, while a player
 * without controls stays without.
 */
export function adoptControls(subject: Element) {
	const player = subject.querySelector<HTMLElement>(':scope video-player')
	if (player?.dataset.controls !== 'minimal') {
		return
	}

	levels.set(subject, player.dataset.controls)
	player.dataset.controls = 'lightbox'
}

/**
 * Close the popups open in a player's controls, such as the volume popover,
 * before the player moves. Video.js closes them over a few frames, and Chromium
 * crashes when a state-preserving move carries a popup still closing, so the
 * caller gets to know that one was: the player then moves by plain insertion.
 */
export function closePopups(subject: Element): boolean {
	const popups = subject.querySelectorAll<Popup>(
		'[data-popup]:is([data-open], [data-starting-style], [data-ending-style])',
	)
	for (const popup of popups) {
		popup.close?.('imperative-action')
	}

	return popups.length > 0
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
				!controls.matches(':hover') &&
				!controls.contains(document.activeElement) &&
				pointers.size === 0
			) {
				controls.dataset.userInactive = ''
			}
		}, 2000)
	}

	for (const event of ['pointermove', 'focusin', 'focusout', 'keydown']) {
		root.addEventListener(event, markActive, { signal })
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
	if (controls === null) {
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

/** Send every floated bar away, as the viewer closes. */
export function hideControls() {
	for (const bar of bars.values()) {
		hide(bar)
	}
}

/**
 * Put a bar back in its player, at the player's own control level, where it
 * rises into place: the one in `subject`, or every bar when no subject is
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
		}

		levels.delete(each)
	}

	for (const [each, bar] of bars) {
		if (subject !== undefined && each !== subject) {
			continue
		}

		hide(bar)
		const { controls } = bar
		// Laid out once dropped under the player's edge, so that it rises from there
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
