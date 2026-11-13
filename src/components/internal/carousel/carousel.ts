import { arrowKeySelector, isWithin } from '../lightbox/dom'
import { CarouselMotion, trackWidth } from '../lightbox/motion'

type Carousel = { dispose: () => void }

const live = new Map<HTMLElement, Carousel>()

/**
 * Set up every carousel in the page that isn't set up yet, and stop those whose
 * roots have left the page.
 */
export function setUpCarousels() {
	for (const [root, carousel] of live) {
		if (root.isConnected) {
			continue
		}

		carousel.dispose()
		live.delete(root)
	}

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

	const slides = [...track.querySelectorAll<HTMLElement>(':scope > .amk-carousel-slide')]
	const count = slides.length
	const previous = root.querySelector<HTMLButtonElement>(':scope > * > .amk-carousel-previous')
	const next = root.querySelector<HTMLButtonElement>(':scope > * > .amk-carousel-next')
	const dots = [...root.querySelectorAll<HTMLButtonElement>(':scope > .amk-carousel-dots > button')]
	const status = root.querySelector<HTMLElement>(':scope > .amk-carousel-status')
	const controller = new AbortController()
	const { signal } = controller
	let width = 0
	let current = 0
	/** The slide the status region last named, or that was on show without it. */
	let announced = 0

	const update = (at: number) => {
		current = at
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

		// As in the lightbox, only the slide on show can be reached. Focus inside
		// a slide that just went inert would otherwise fall to <body> at the next
		// rendering update
		const focused = document.activeElement
		for (const [position, slide] of slides.entries()) {
			slide.inert = position !== at
		}

		if (focused !== null && slides.some((slide) => slide.inert && slide.contains(focused))) {
			track.focus({ preventScroll: true })
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
			// Only once settled, rather than as each slide passes the middle
			const slide = slides[current]
			if (current === announced || status === null || slide === undefined) {
				return
			}

			announced = current
			status.textContent = describeSlide(slide)
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
			width = trackWidth(track)
			update(event.detail)
			// The lightbox names its own slides
			announced = event.detail
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
				// Pressed inside a slide too, where the browser would scroll the track
				motion.step(step * motion.direction)
			} else if (isWithin(event, '.amk-carousel-slide', root)) {
				// Home and End inside a slide are left to the page, which they scroll
				return
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

	// The slides stay a track's width apart, and the scroll offset follows,
	// landing on the slide a glide under way was heading for
	const observer = new ResizeObserver(() => {
		const laidOut = trackWidth(track)
		if (laidOut === width) {
			return
		}

		width = laidOut
		const at = motion.target
		motion.resize(width)
		motion.go(at, 'instant')
	})
	observer.observe(track)

	return {
		dispose() {
			controller.abort()
			observer.disconnect()
			motion.destroy()
			for (const slide of slides) {
				slide.inert = false
			}
		},
	}
}

/**
 * What a screen reader hears as a slide settles, as in the lightbox: its
 * position, and its caption or else its media's name.
 */
function describeSlide(slide: HTMLElement): string {
	const media = slide.querySelector('img[alt], [aria-label]')
	const texts = [
		slide.querySelector('figcaption')?.textContent,
		media?.getAttribute('alt'),
		media?.getAttribute('aria-label'),
	]
	const name = texts.map((text) => text?.trim() ?? '').find((text) => text !== '') ?? ''
	const label = slide.getAttribute('aria-label') ?? ''
	return name === '' ? label : `${label}, ${name}`
}
