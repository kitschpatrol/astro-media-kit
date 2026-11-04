import { arrowKeySelector, isWithin } from '../lightbox/dom'
import { CarouselMotion } from '../lightbox/motion'
import { subscribeMediaIconTheme } from '../media-theme'

type Carousel = { dispose: () => void }

const live = new Map<HTMLElement, Carousel>()

/** Set up every carousel in the page that isn't set up yet. */
export function setUpCarousels() {
	for (const root of document.querySelectorAll<HTMLElement>('.amk-carousel')) {
		if (live.has(root)) {
			continue
		}

		try {
			live.set(root, setUp(root))
		} catch (error) {
			// One carousel without its parts must not keep the others from working
			console.warn('[astro-media-kit] Skipping a carousel that could not be set up.', error)
		}
	}
}

/** Stop every carousel, before a client-side router replaces the page. */
export function disposeCarousels() {
	for (const carousel of live.values()) {
		carousel.dispose()
	}

	live.clear()
}

/** Set carousels up now and after every client-side navigation. */
export function installCarousels() {
	setUpCarousels()
	document.addEventListener('astro:page-load', setUpCarousels)
	document.addEventListener('astro:before-swap', disposeCarousels)
}

function setUp(root: HTMLElement): Carousel {
	const track = root.querySelector<HTMLElement>(
		':scope > .amk-carousel-viewport > .amk-carousel-track',
	)
	if (track === null) {
		throw new TypeError('[astro-media-kit] A carousel is missing its track.', { cause: root })
	}

	const count = track.querySelectorAll(':scope > .amk-carousel-slide').length
	const previous = root.querySelector<HTMLButtonElement>(':scope > * > .amk-carousel-previous')
	const next = root.querySelector<HTMLButtonElement>(':scope > * > .amk-carousel-next')
	const dots = [...root.querySelectorAll<HTMLButtonElement>(':scope > .amk-carousel-dots > button')]
	const controller = new AbortController()
	const { signal } = controller
	const unsubscribeIcons = subscribeMediaIconTheme(
		root.querySelectorAll<HTMLElement>(
			':scope > .amk-carousel-viewport > .amk-carousel-button [data-amk-icon]',
		),
	)
	let width = 0

	const update = (at: number) => {
		if (previous !== null) {
			previous.ariaDisabled = String(at === 0)
		}

		if (next !== null) {
			next.ariaDisabled = String(at === count - 1)
		}

		for (const [position, dot] of dots.entries()) {
			if (position === at) {
				dot.ariaCurrent = 'true'
			} else {
				dot.removeAttribute('aria-current')
			}
		}
	}

	const motion = new CarouselMotion(track, {
		canNavigate: () => true,
		dismissible() {
			// Nothing to dismiss in the page
		},
		duration: () => getComputedStyle(track).transitionDuration,
		onChange: update,
		onDismissEnd() {
			// Nothing to dismiss in the page
		},
		onDismissMove() {
			// Nothing to dismiss in the page
		},
		onPrepare() {
			// Every slide is in the page already
		},
		onRest() {
			// Nothing to settle beyond the track
		},
		stage() {
			// Nothing zooms in the page
		},
	})
	motion.configure(count, 0)
	update(0)

	// A returning lightbox item takes ownership from any page-carousel glide.
	track.addEventListener(
		'amk-carousel-reveal',
		(event) => {
			if (
				event.target !== track ||
				!(event instanceof CustomEvent) ||
				typeof event.detail !== 'number' ||
				!Number.isInteger(event.detail) ||
				event.detail < 0 ||
				event.detail >= count
			) {
				return
			}

			event.preventDefault()
			// Configure stops motion and refreshes both width and reading direction.
			motion.configure(count, event.detail)
			width = track.clientWidth
			update(event.detail)
		},
		{ signal },
	)

	previous?.addEventListener(
		'click',
		() => {
			motion.step(-1)
		},
		{ signal },
	)
	next?.addEventListener(
		'click',
		() => {
			motion.step(1)
		},
		{ signal },
	)
	for (const [position, dot] of dots.entries()) {
		dot.addEventListener(
			'click',
			() => {
				motion.go(position)
			},
			{ signal },
		)
	}

	root.addEventListener(
		'keydown',
		(event) => {
			if (
				event.defaultPrevented ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				isWithin(event, arrowKeySelector, root)
			) {
				return
			}

			const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
			if (step !== 0) {
				motion.step(step * motion.direction)
			} else if (event.key === 'Home') {
				motion.go(0, 'instant')
			} else if (event.key === 'End') {
				motion.go(count - 1, 'instant')
			} else {
				return
			}

			event.preventDefault()
		},
		{ signal },
	)

	// The slide widths follow the track's, and the scroll offset with them,
	// landing on the slide a glide under way was heading for
	const observer = new ResizeObserver(() => {
		if (track.clientWidth === width) {
			return
		}

		width = track.clientWidth
		const at = motion.target
		motion.resize(width)
		motion.go(at, 'instant')
	})
	observer.observe(track)

	return {
		dispose() {
			unsubscribeIcons()
			controller.abort()
			observer.disconnect()
			motion.destroy()
		},
	}
}
