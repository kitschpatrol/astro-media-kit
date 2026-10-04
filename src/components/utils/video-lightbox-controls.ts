/** Clone the server-rendered player without sharing tooltip IDs between slides. */
export function cloneLightboxPlayer(template: HTMLTemplateElement): DocumentFragment {
	const fragment = template.content.cloneNode(true) as DocumentFragment
	const ids = new Map<string, string>()
	const prefix = `amk-${crypto.randomUUID()}`
	for (const element of fragment.querySelectorAll('[id]')) {
		const id = `${prefix}-${element.id}`
		ids.set(element.id, id)
		element.id = id
	}

	for (const element of fragment.querySelectorAll('[trigger]')) {
		const trigger = element.getAttribute('trigger') ?? ''
		if (ids.has(trigger)) {
			element.setAttribute('trigger', ids.get(trigger)!)
		}
	}

	return fragment
}

/**
 * Activity covers the viewport, but focus and dragging keep the controls
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
