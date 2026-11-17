import { interactiveSelector, isWithin } from './dom'

/** Stop inputs that would reach the page, while keeping native inner scrolling. */
export function containPageScroll(dialog: HTMLDialogElement) {
	dialog.addEventListener(
		'wheel',
		(event) => {
			const x = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX
			const y = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY
			if (
				event.cancelable &&
				!event.defaultPrevented &&
				!event.ctrlKey &&
				!canScroll(event, dialog, x, y)
			) {
				event.preventDefault()
			}
		},
		{ passive: false },
	)

	let touch: ReturnType<typeof touchPosition>
	const rebase = (event: TouchEvent) => {
		touch = touchPosition(event.touches)
	}

	for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
		dialog.addEventListener(type, rebase, { passive: true })
	}

	dialog.addEventListener(
		'touchmove',
		(event) => {
			const point = touchPosition(event.touches)
			// Multiple fingers can pan an inner image or caption, but must not
			// turn slides or bypass containment and reach the page behind it.
			const boundary =
				event.touches.length > 1 ? (dialog.querySelector('.amk-lightbox-track') ?? dialog) : dialog
			if (
				point !== undefined &&
				point.count === touch?.count &&
				event.cancelable &&
				!event.defaultPrevented &&
				!canScroll(event, boundary, touch.x - point.x, touch.y - point.y)
			) {
				event.preventDefault()
			}

			touch = point
		},
		{ passive: false },
	)
}

function touchPosition(touches: TouchList): undefined | { count: number; x: number; y: number } {
	if (touches.length === 0) {
		return undefined
	}

	let x = 0
	let y = 0
	for (const point of touches) {
		x += point.clientX
		y += point.clientY
	}

	return { count: touches.length, x: x / touches.length, y: y / touches.length }
}

/** Contain scrolling keys left unused by the viewer. */
export function containScrollKey(event: KeyboardEvent, dialog: HTMLDialogElement) {
	const direction =
		event.key === 'PageUp' || event.key === 'ArrowUp'
			? -1
			: event.key === 'PageDown' || event.key === 'ArrowDown'
				? 1
				: event.key === ' '
					? event.shiftKey
						? -1
						: 1
					: 0
	if (direction === 0 || (event.key === ' ' && isWithin(event, interactiveSelector, dialog))) {
		return
	}

	if (!canScroll(event, dialog, 0, direction)) {
		event.preventDefault()
	}
}

function canScroll(event: Event, boundary: Element, x: number, y: number): boolean {
	const isHorizontal = Math.abs(x) > Math.abs(y)
	const delta = isHorizontal ? x : y
	if (delta === 0) {
		return true
	}

	for (const element of event.composedPath()) {
		if (element === boundary) {
			break
		}

		if (!(element instanceof HTMLElement)) {
			continue
		}

		const extent = isHorizontal
			? element.scrollWidth - element.clientWidth
			: element.scrollHeight - element.clientHeight
		if (extent <= 0) {
			continue
		}

		const style = getComputedStyle(element)
		const overflow = isHorizontal ? style.overflowX : style.overflowY
		if (overflow !== 'auto' && overflow !== 'scroll') {
			continue
		}

		const position = isHorizontal ? element.scrollLeft : element.scrollTop
		const min = isHorizontal && style.direction === 'rtl' ? -extent : 0
		const max = min + extent
		if (delta < 0 ? position > min : position < max) {
			return true
		}

		if ((isHorizontal ? style.overscrollBehaviorX : style.overscrollBehaviorY) !== 'auto') {
			return false
		}
	}

	return false
}
