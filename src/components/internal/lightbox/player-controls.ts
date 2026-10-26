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

/** The bars that are floated or on their way out, by their player's subject. */
const bars = new Map<Element, Bar>()

/**
 * Track whether the viewer is in use, so the floated controls can hide.
 * Activity covers the whole viewer, but focus and dragging keep the controls
 * visible.
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
			if (controls && !controls.contains(document.activeElement) && pointers.size === 0) {
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
 * Put a bar back in its player, straight away: the one in `subject`, or every
 * bar when no subject is given.
 */
export function releaseControls(subject?: Element) {
	for (const [each, bar] of bars) {
		if (subject !== undefined && each !== subject) {
			continue
		}

		hide(bar)
		bar.controls.removeAttribute('popover')
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
