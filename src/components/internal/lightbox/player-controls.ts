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
	exit: number
}

type Background = {
	controls: HTMLElement
	element: HTMLElement
	exit: number
	observer: ResizeObserver
	subject: Element
}

/** One surface under the independently fading bars, so their alpha never stacks. */
let background: Background | undefined

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
		setBackgroundInactive(controls, false)
		timer = setTimeout(() => {
			// A popup of the controls, such as the volume popover, counts as
			// hovering them, as it is in the DOM
			if (
				!controls ||
				controls.closest('video-player')?.hasAttribute('data-playing') === false ||
				controls.matches(':hover, :has([data-popup]:hover)') ||
				controls.contains(document.activeElement) ||
				pointers.size > 0
			) {
				return
			}

			controls.dataset.userInactive = ''
			setBackgroundInactive(controls, true)
		}, 1500)
	}

	for (const event of ['pointermove', 'focusin', 'focusout', 'keydown']) {
		root.addEventListener(event, markActive, { signal })
	}

	const handlePlayback = (event: Event) => {
		// Neighboring videos can keep playing or finish loading while lifted.
		// Their events must not wake this bar and restart its idle fade.
		const player = controls?.closest('video-player')
		if (player && event.composedPath().includes(player)) {
			markActive()
		}
	}

	for (const type of ['play', 'pause', 'ended']) {
		root.addEventListener(type, handlePlayback, { capture: true, signal })
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
	const controls = subject.querySelector<HTMLElement>(':scope video-player .amk-controls')
	const hasControls =
		controls !== null && controls.closest<HTMLElement>('video-player')?.dataset.controls !== 'none'
	let crossfade = false
	let opacity = 0
	for (const [other, bar] of bars) {
		if (other === subject) {
			continue
		}

		const isReplacing = hasControls && bar.controls.matches(':popover-open')
		crossfade ||= isReplacing
		bar.controls.toggleAttribute('data-crossfade', isReplacing)
		closePopups(other)
		if (isReplacing) {
			opacity = Math.max(opacity, Number(getComputedStyle(bar.controls).opacity))
			void fadeOut(bar)
		} else {
			hide(bar)
		}
	}

	if (!hasControls) {
		hideBackground()
		return
	}

	controls.toggleAttribute('data-crossfade', crossfade)
	const bar = bars.get(subject) ?? { activity: undefined, controls, exit: 0 }
	bar.exit++
	delete controls.dataset.crossfadeOut
	bars.set(subject, bar)
	if (!controls.matches(':popover-open')) {
		if (!controls.hasAttribute('popover')) {
			// Settle a newly floated bar as a hidden popover first. An existing
			// popover may still be fading out: reopening it reverses that fade.
			const { transition } = controls.style
			controls.style.transition = 'none'
			controls.popover = 'manual'
			controls.getBoundingClientRect()
			controls.style.transition = transition
		}

		controls.showPopover()
	}

	bar.activity ??= createControlsActivity(viewer)
	bar.activity.setControls(controls)
	if (crossfade) {
		floatBackground(subject, controls, viewer, opacity)
	} else {
		dropBackground()
	}
}

/** Send every floated bar away, with the popups it holds, as the viewer closes. */
export function hideControls() {
	for (const [subject, bar] of bars) {
		closePopups(subject)
		delete bar.controls.dataset.crossfade
		hide(bar)
	}

	hideBackground()
}

/**
 * Put a bar back in its player, at the player's own control level. Its page
 * wrapper owns the visibility fade; an inactive item replaces an already
 * visible control preview. Release one subject, or every bar when omitted.
 */
export function releaseControls(subject?: Element) {
	if (background !== undefined && (subject === undefined || background.subject === subject)) {
		dropBackground()
	}

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
		// Replace the page preview at its current opacity. The active thumbnail
		// remains faded until restore; inactive thumbnails are already visible.
		const { transition } = controls.style
		controls.style.transition = 'none'
		controls.removeAttribute('popover')
		delete controls.dataset.crossfade
		controls.querySelector('[data-floated-background]')?.removeAttribute('data-floated-background')
		controls.getBoundingClientRect()
		controls.style.transition = transition
		bars.delete(each)
	}
}

function floatBackground(
	subject: Element,
	controls: HTMLElement,
	viewer: HTMLElement,
	opacity: number,
) {
	const strip = controls.querySelector<HTMLElement>('.amk-bar')
	if (strip === null) {
		hideBackground()
		return
	}

	if (background === undefined) {
		const element = document.createElement('div')
		element.className = 'amk-controls-background'
		element.ariaHidden = 'true'
		element.inert = true
		// Take over the existing bar's paint in the same frame, without another fade.
		element.style.transition = 'none'
		element.style.opacity = String(opacity)
		element.dataset.visible = ''
		// Below every control popover, but above the media and below viewer buttons.
		viewer.insertBefore(element, viewer.querySelector('.amk-lightbox-button'))
		background = {
			controls,
			element,
			exit: 0,
			observer: new ResizeObserver(syncBackground),
			subject,
		}
	}

	background.observer.disconnect()
	background.controls = controls
	background.subject = subject
	background.observer.observe(strip)
	syncBackground()
	for (const bar of bars.values()) {
		const other = bar.controls.querySelector<HTMLElement>('.amk-bar')
		if (other !== null) {
			setFloatedBackground(other, true)
		}
	}

	background.element.getBoundingClientRect()
	background.element.style.removeProperty('transition')
	background.element.style.removeProperty('opacity')
	background.element.dataset.visible = ''
	delete background.element.dataset.userInactive
	void settleBackground(background, ++background.exit)
}

/** Restore ordinary bar painting once the overlapping controls have settled. */
async function settleBackground(current: Background, exit: number): Promise<void> {
	const barsFading = bars
		.values()
		.flatMap(({ controls }) =>
			controls
				.getAnimations()
				.filter(
					(animation) =>
						animation instanceof CSSTransition && animation.transitionProperty === 'opacity',
				),
		)
	const fades = [...current.element.getAnimations(), ...barsFading]
	await Promise.allSettled(fades.map(async (animation) => animation.finished))
	if (background === current && current.exit === exit) {
		dropBackground()
	}
}

function dropBackground() {
	if (background === undefined) {
		return
	}

	background.observer.disconnect()
	background.element.remove()
	background = undefined
	for (const { controls } of bars.values()) {
		const strip = controls.querySelector<HTMLElement>('.amk-bar')
		if (strip !== null) {
			setFloatedBackground(strip, false)
		}
	}
}

function setFloatedBackground(strip: HTMLElement, floated: boolean) {
	const transition = strip.style.getPropertyValue('transition')
	const priority = strip.style.getPropertyPriority('transition')
	strip.style.setProperty('transition', 'none', 'important')
	strip.toggleAttribute('data-floated-background', floated)
	strip.getBoundingClientRect()
	strip.style.setProperty('transition', transition, priority)
}

function syncBackground() {
	if (background === undefined) {
		return
	}

	const { controls, element } = background
	const strip = controls.querySelector<HTMLElement>('.amk-bar')
	if (strip === null) {
		return
	}

	// Read the authored surface before suppressing it on the real bar. This also
	// preserves local player themes and direct background overrides, including gradients.
	const transition = strip.style.getPropertyValue('transition')
	const priority = strip.style.getPropertyPriority('transition')
	strip.style.setProperty('transition', 'none', 'important')
	delete strip.dataset.floatedBackground
	const paint = getComputedStyle(strip)
	element.style.background = paint.background
	element.style.borderRadius = paint.borderRadius
	const bounds = strip.getBoundingClientRect()
	element.style.left = `${bounds.left}px`
	element.style.width = `${bounds.width}px`
	element.style.height = `${bounds.height}px`
	const style = getComputedStyle(controls)
	element.style.bottom = style.bottom
	for (const property of ['--amk-duration', '--amk-lightbox-duration', '--amk-lightbox-easing']) {
		element.style.setProperty(property, style.getPropertyValue(property))
	}

	strip.dataset.floatedBackground = ''
	strip.getBoundingClientRect()
	strip.style.setProperty('transition', transition, priority)
}

function hideBackground() {
	if (background === undefined) {
		return
	}

	delete background.element.dataset.visible
	background.observer.disconnect()
	void settleBackground(background, ++background.exit)
}

function setBackgroundInactive(controls: HTMLElement, inactive: boolean) {
	if (background?.controls === controls) {
		background.element.toggleAttribute('data-user-inactive', inactive)
	}
}

function hide(bar: Bar) {
	bar.exit++
	bar.activity?.destroy()
	bar.activity = undefined
	delete bar.controls.dataset.crossfadeOut
	if (bar.controls.matches(':popover-open')) {
		bar.controls.hidePopover()
	}
}

/** Keep the outgoing bar in the top layer until its opacity fade finishes. */
async function fadeOut(bar: Bar): Promise<void> {
	bar.activity?.destroy()
	bar.activity = undefined
	const exit = ++bar.exit
	bar.controls.dataset.crossfadeOut = ''
	const fades = bar.controls
		.getAnimations()
		.filter(
			(animation) =>
				animation instanceof CSSTransition && animation.transitionProperty === 'opacity',
		)
	await Promise.allSettled(fades.map(async (animation) => animation.finished))
	if (exit === bar.exit && bar.controls.matches(':popover-open')) {
		bar.controls.hidePopover()
	}
}
