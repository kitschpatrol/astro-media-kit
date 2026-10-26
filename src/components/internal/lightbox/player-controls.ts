/**
 * The kit's Video.js player travels into the viewer whole, so its own control
 * bar is floated over the viewer rather than building a second player. The bar
 * is a manual popover: the top layer escapes the slide's zoom transform.
 */

type Floated = {
	activity: ReturnType<typeof createControlsActivity>
	controls: HTMLElement
	subject: Element
}

let floated: Floated | undefined

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
 * `viewer`. Any bar floated before goes back to its player.
 */
export function floatControls(subject: Element, viewer: HTMLElement) {
	releaseControls()
	const controls = subject.querySelector<HTMLElement>(':scope video-player .amk-controls')
	if (controls === null) {
		return
	}

	controls.popover = 'manual'
	controls.showPopover()
	const activity = createControlsActivity(viewer)
	activity.setControls(controls)
	floated = { activity, controls, subject }
}

/**
 * Put the floated control bar back in its player: the one in `subject`, or
 * whichever is floated when no subject is given.
 */
export function releaseControls(subject?: Element) {
	if (floated === undefined || (subject !== undefined && floated.subject !== subject)) {
		return
	}

	const { activity, controls } = floated
	floated = undefined
	activity.destroy()
	if (controls.matches(':popover-open')) {
		controls.hidePopover()
	}

	controls.removeAttribute('popover')
}
