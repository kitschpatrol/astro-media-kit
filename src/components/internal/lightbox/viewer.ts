import type { Box } from './geometry'
import type { LayerStyle, Lift, Measurement, Point, Slide } from './types'
import { identity, layerStyle, linkStyle, setLayerStyle, settle } from './animation'
import { viewerMarkup } from './chrome'
import {
	arrowKeySelector,
	captionOf,
	interactiveSelector,
	isInPlayer,
	isItem,
	isLinkItem,
	isNativeLink,
	isWithin,
	itemSelector,
	rendered,
	subjectOf,
	textEntrySelector,
} from './dom'
import { lengthOf } from './geometry'
import { refreshImagePreview } from './image-preview'
import { canFade, canFadeHome, dropSlides, liftSlide, measure } from './lift'
import { readyToShow } from './link'
import { hasZoomLevel, zoomWidth } from './media'
import { CarouselMotion, trackWidth } from './motion'
import { closeInactiveTooltips, floatControls, hideControls } from './player-controls'
import { prepareImage, prepareSlideImage } from './prepare'
import { containPageScroll, containScrollKey } from './scroll-boundary'
import { beginVolumes, endVolumes, focusVolumes } from './volume'
import { Zoom } from './zoom'

type State = 'closing' | 'idle' | 'open' | 'opening'

/** Opens an item and its gallery, as `openLightbox()` does. */
type Opener = (item: HTMLElement) => Promise<boolean>

/** How far one arrow key press pans a zoomed subject, in pixels. */
const panStep = 80

/** The direction each arrow key pans a zoomed subject in. */
const panDirections = new Map<string, [x: number, y: number]>([
	['ArrowDown', [0, 1]],
	['ArrowLeft', [-1, 0]],
	['ArrowRight', [1, 0]],
	['ArrowUp', [0, -1]],
])

/**
 * The full-screen viewer. There is one per document, created on first use. It
 * lifts subjects out of the page into a scroll-snap carousel inside a modal
 * `<dialog>`, and puts them back when it closes.
 */
class Viewer {
	/** The page item whose controls are hidden while its media is active. */
	#activePageItem: HTMLElement | undefined
	#activeSlide: Slide | undefined
	/** The subject whose player controls are floated, if it has any. */
	#activeSubject: Element | undefined
	readonly #dialog: HTMLDialogElement
	#dismissLayer: HTMLElement | undefined
	#generation = 0
	/** Slides finishing their way home after another item took over. */
	#ghosts: Slide[] = []
	#height = 0
	#index = 0
	/** Whether the keyboard has navigated since the viewer opened. */
	#isKeyboardNavigated = false
	readonly #motion: CarouselMotion
	readonly #next: HTMLButtonElement
	#openedIndex = 0
	#openingClickDeadline = 0
	#openItem: Opener | undefined
	readonly #previous: HTMLButtonElement
	#slides: Slide[] = []
	#state: State = 'idle'
	/** Tells screen readers which slide is current. */
	readonly #status: HTMLElement
	readonly #track: HTMLElement
	#width = 0
	readonly #zoom = new Zoom(() => {
		this.#updateZoomState()
	})
	readonly #zoomButton: HTMLButtonElement

	get #isNavigable(): boolean {
		return this.#state === 'open' || this.#state === 'opening'
	}

	constructor() {
		const template = document.createElement('template')
		template.innerHTML = viewerMarkup()
		const fragment = document.importNode(template.content, true)
		this.#dialog = query(fragment, 'dialog', HTMLDialogElement)
		this.#track = query(fragment, '.amk-lightbox-track', HTMLElement)
		this.#status = query(fragment, '.amk-lightbox-status', HTMLElement)
		this.#previous = query(fragment, '.amk-lightbox-previous', HTMLButtonElement)
		this.#next = query(fragment, '.amk-lightbox-next', HTMLButtonElement)
		this.#zoomButton = query(fragment, '.amk-lightbox-zoom', HTMLButtonElement)
		containPageScroll(this.#dialog)

		this.#dialog.addEventListener('cancel', this.#handleCancel)
		this.#dialog.addEventListener('click', this.#handleClick)
		this.#dialog.addEventListener('close', this.#handleClose)
		this.#dialog.addEventListener('dragstart', preventDefault)
		this.#dialog.addEventListener('pointerover', this.#prepareZoom)
		this.#dialog.addEventListener('focusin', this.#prepareZoom)
		this.#motion = new CarouselMotion(this.#track, {
			canNavigate: () => this.#isNavigable,
			dismissible: () => {
				const slide = this.#slides[this.#index]
				return this.#state === 'open' &&
					this.#zoom.current === undefined &&
					slide?.lift !== undefined
					? slide.layer
					: undefined
			},
			duration: () => getComputedStyle(this.#track).transitionDuration,
			onChange: (index) => {
				this.#setIndex(index)
			},
			onDismissEnd: (shouldDismiss) => {
				this.#endDismiss(shouldDismiss)
			},
			onDismissMove: (distance) => {
				const layer = this.#slides[this.#index]?.layer
				if (layer === undefined) {
					return
				}

				this.#dismissLayer = layer
				this.#dialog.dataset.dismissing = ''
				this.#dialog.style.setProperty(
					'--amk-lightbox-drag-opacity',
					String(Math.max(0, 1 - Math.abs(distance) / (this.#height * 0.5))),
				)
				setLayerStyle(layer, { ...identity, translate: `0 ${distance}px` }, false)
			},
			onPrepare: (index) => {
				this.#liftAround(index)
			},
			onRest: () => {
				this.#rest()
			},
			stage: () =>
				this.#zoom.current === this.#slides[this.#index] ? this.#zoom.current?.stage : undefined,
		})
		new ResizeObserver(this.#handleResize).observe(this.#track)
		document.body.append(this.#dialog)
	}

	/**
	 * Animate the current subject back into the page, then put it back. Every
	 * other lifted subject goes back straight away, while the backdrop still
	 * hides the page. Does nothing unless the viewer is open or opening.
	 */
	async close(): Promise<void> {
		if (!this.#isNavigable) {
			return
		}

		const isOpening = this.#state === 'opening'
		const generation = ++this.#generation
		hideControls()
		// A reopen floats the controls again, as a hand-over does
		this.#activeSubject = undefined
		// Escape or a close command can interrupt a held drag. Commit its
		// backdrop opacity before enabling the closing transition.
		this.#dialog.getAnimations()
		delete this.#dialog.dataset.dismissing
		this.#state = 'closing'
		this.#dialog.dataset.state = 'closing'
		// The open-state rules no longer apply, so dropping a drag's dimming
		// here keeps the fade smooth and brings a reopened viewer back in full
		this.#dialog.style.removeProperty('--amk-lightbox-drag-opacity')

		// Settle on the slide that is showing, even if a swipe, drag, or glide is
		// underway
		this.#motion.stop()
		const { index } = this.#motion
		if (index !== this.#index) {
			this.#index = index
			this.#setPageItem(this.#slides[index]?.item)
			this.#updateControls()
		}

		this.#motion.render(index * this.#width)
		requestAnimationFrame(() => {
			// Chromium can still commit an interrupted swipe on the next frame
			if (generation === this.#generation) {
				this.#motion.render(index * this.#width)
			}
		})

		dropSlides(this.#slides.filter((_slide, position) => position !== index))
		const slide = this.#slides[index]
		if (slide !== undefined && slide.lift === undefined) {
			this.#liftAround(index, 0)
		}

		const lift = slide?.lift
		if (slide === undefined || lift === undefined || !this.#canReturn(lift)) {
			this.restore()
			return
		}

		// An embedded carousel already follows the viewer; a glide underway on
		// the page still has to stop here. Its ancestors never scroll, and other
		// offscreen thumbnails keep their position as the return target.
		revealCarouselItem(lift.item)
		setLayerStyle(slide.layer, this.#homeStyle(slide, lift, isOpening))
		await this.#finishClose(slide, generation)
	}

	/**
	 * Lift `items[index]` out of the page and animate it up from its place. Its
	 * neighbors follow once the opening transition has finished, while the
	 * backdrop hides the page. Resolves at that point, or when interrupted, to
	 * whether it opened: not while already open, or without a subject. While
	 * still opening or closing, the item takes over, and the subject on its way
	 * finishes gliding home. `openItem` opens an item clicked under the viewer
	 * meanwhile.
	 */
	async open(items: HTMLElement[], index: number, openItem: Opener): Promise<boolean> {
		if (!this.#dialog.isConnected) {
			// The page replaced <body>, as client-side routers do
			this.restore()
			document.body.append(this.#dialog)
		}

		if (this.#state === 'open') {
			return false
		}

		const item = items[index]
		if (item !== undefined) {
			// A page carousel shows the slide before it is measured, so the lift
			// starts from where the subject returns, not from a slide passing by
			revealCarouselItem(item)
		}

		const current = item === undefined ? undefined : measure(item)
		if (current === undefined) {
			return false
		}

		if (this.#state !== 'idle') {
			this.#handOver()
		}

		const generation = ++this.#generation
		this.#state = 'opening'
		this.#openItem = openItem
		this.#openingClickDeadline = performance.now() + 150
		this.#index = index
		this.#openedIndex = index
		this.#isKeyboardNavigated = false
		this.#setPageItem(current.item)

		this.#slides = items.map((each, position) => createSlide(each, position, items.length))
		// Ghosts stay where they are, so their transitions carry on
		const stale = [...this.#track.children].filter((child) =>
			this.#ghosts.every((ghost) => ghost.element !== child),
		)
		for (const child of stale) {
			child.remove()
		}

		this.#track.append(...this.#slides.map((slide) => slide.element))
		beginVolumes(
			this.#slides.map((slide) => this.#rootOf(slide)),
			this.#rootOf(this.#slides[index]!),
		)

		// Show, lift, and lay out in one task: a video left without a layout box
		// across tasks can stall or skip in WebKit
		if (!this.#dialog.open) {
			this.#dialog.showModal()
		}

		this.#dialog.focus({ preventScroll: true })
		document.addEventListener('keydown', this.#handleKeydown)
		document.addEventListener('keydown', this.#handlePlayerKeydown, { capture: true })
		this.#lift(this.#slides[index]!, current)
		// With the dialog shown and the slide's media in it, so that the status
		// region announces the slide, by name
		this.#updateControls()
		this.#width = trackWidth(this.#track)
		this.#height = this.#track.clientHeight
		this.#motion.configure(this.#slides.length, index)

		const slide = this.#slides[index]
		const lift = slide?.lift
		if (slide === undefined || lift === undefined) {
			return true
		}

		const isLink = isLinkItem(lift.item)
		const frame = slide.frame.getBoundingClientRect()
		lift.from = isLink
			? linkStyle(frame, current.target)
			: layerStyle(frame, current.target, current)
		const start = current.position === undefined ? identity : lift.from
		// Images and videos fade in over the preview left behind.
		setLayerStyle(slide.layer, canFade(lift) ? { ...start, opacity: '0' } : start, false)
		// Commit the start values, including the backdrop's and the controls'
		// opacity, so the changes below transition from them
		slide.layer.getAnimations()
		if (isLink) {
			// A link's media has only just started loading: the backdrop and the
			// controls come up meanwhile, and the media once it can show
			this.#dialog.dataset.state = 'open'
			await readyToShow(lift.subject)
			if (generation !== this.#generation) {
				return true
			}
		}

		await this.#expand(slide, generation)
		return true
	}

	/**
	 * Put every lifted subject back and close the dialog, without animating. Runs
	 * at the end of a close, or straight away when something else closes the
	 * dialog or removes it from the page.
	 */
	restore() {
		const current = this.#slides[this.#index]
		const hasNavigated = this.#index !== this.#openedIndex
		endVolumes()
		dropSlides([...this.#slides, ...this.#ghosts])
		this.#dialog.close()
		// Its player is home before the page controls begin fading back in.
		this.#setPageItem(undefined)
		if (current !== undefined) {
			closeInactiveTooltips(current.item)
		}

		this.#generation++
		this.#state = 'idle'
		this.#slides = []
		this.#ghosts = []
		this.#activeSlide = undefined
		this.#activeSubject = undefined
		this.#openItem = undefined
		this.#track.replaceChildren()
		this.#motion.stop()
		this.#dismissLayer = undefined
		delete this.#dialog.dataset.dismissing
		this.#dialog.style.removeProperty('--amk-lightbox-drag-opacity')
		delete this.#dialog.dataset.state
		document.removeEventListener('keydown', this.#handleKeydown)
		document.removeEventListener('keydown', this.#handlePlayerKeydown, { capture: true })
		this.#zoom.reset()

		// Closing returns focus to whatever opened the viewer. After navigating
		// from the keyboard, the item now showing is the better place to continue
		// from. After navigating with a pointer it is left alone, since the key
		// that closes the viewer would otherwise light its focus ring
		if (
			hasNavigated &&
			this.#isKeyboardNavigated &&
			current?.item.isConnected === true &&
			current.item.tabIndex >= 0
		) {
			current.item.focus({ preventScroll: true })
		}
	}

	/**
	 * Give the subject that has become the active slide its player controls and
	 * its sound, and fade the sound of every other item away.
	 */
	#activate() {
		const subject = this.#slides[this.#index]?.lift?.subject
		if (subject === undefined || subject === this.#activeSubject) {
			return
		}

		this.#activeSubject = subject
		floatControls(subject, this.#dialog)
		focusVolumes(subject)
	}

	/**
	 * Whether a lifted subject has a place to animate back to: not if its item
	 * was removed or hidden, if its position in the page isn't known, or if it
	 * had no size there (an image that never loaded).
	 */
	#canReturn(lift: Lift): boolean {
		return (
			lift.item.checkVisibility() &&
			lift.position !== undefined &&
			lift.offset.width > 0 &&
			lift.offset.height > 0
		)
	}

	/**
	 * Keep a key from scrolling the page under a subject on its way home, unless
	 * it is for a control that uses it.
	 */
	#containKeyWhileClosing(event: KeyboardEvent) {
		if (
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			isWithin(event, arrowKeySelector, this.#dialog)
		) {
			return
		}

		if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault()
		} else {
			containScrollKey(event, this.#dialog)
		}
	}

	/** Put the given ghosts back straight away. */
	#dropGhosts(ghosts: Slide[]) {
		this.#ghosts = this.#ghosts.filter((ghost) => !ghosts.includes(ghost))
		dropSlides(ghosts)
		for (const ghost of ghosts) {
			ghost.element.remove()
		}
	}

	/** Release the drag from its current position, either home or back to fitting. */
	#endDismiss(shouldDismiss: boolean) {
		const layer = this.#dismissLayer
		if (layer === undefined) {
			return
		}

		// Commit the pointer's last position before restoring CSS transitions.
		this.#dialog.getAnimations()
		delete this.#dialog.dataset.dismissing
		this.#dismissLayer = undefined
		if (shouldDismiss) {
			void this.close()
			return
		}

		this.#dialog.style.removeProperty('--amk-lightbox-drag-opacity')
		if (this.#state === 'open') {
			setLayerStyle(layer, identity)
		}
	}

	/**
	 * Zoom the current subject up to fill its frame, then lift its neighbors.
	 * Resolves once it settles, or when interrupted.
	 */
	async #expand(slide: Slide, generation: number) {
		this.#dialog.dataset.state = 'open'
		setLayerStyle(slide.layer, identity)
		await settle(slide.layer)
		if (generation !== this.#generation) {
			return
		}

		this.#state = 'open'
		this.#updateZoomState()
		this.#liftAround(this.#index)
	}

	/** Finish the return zoom and its fade, then restore the original. */
	async #finishClose(slide: Slide, generation: number) {
		await settle(slide.layer)
		// Any later close or restore bumps the generation
		if (generation === this.#generation) {
			this.restore()
		}
	}

	#handleButtonClick(event: MouseEvent, button: HTMLButtonElement) {
		if (event.defaultPrevented || !this.#isNavigable) {
			return
		}

		switch (button.dataset.action ?? '') {
			case 'close': {
				void this.close()

				break
			}

			case 'next': {
				this.#noteKeyboardButton(button)
				this.#motion.step(1)

				break
			}

			case 'previous': {
				this.#noteKeyboardButton(button)
				this.#motion.step(-1)

				break
			}

			case 'zoom': {
				this.#toggleZoom()

				break
			}

			default: {
				break
			}
		}
	}

	readonly #handleCancel = (event: Event) => {
		if (event.cancelable) {
			event.preventDefault()
			void this.close()
		} else {
			// The browser is closing the dialog regardless (e.g. a repeated
			// close request), so put everything back before it does
			this.restore()
		}
	}

	readonly #handleClick = (event: MouseEvent) => {
		// Ordinary button activation also works without the Invoker Commands API.
		const button = event
			.composedPath()
			.find(
				(target): target is HTMLButtonElement =>
					target instanceof HTMLButtonElement && target.parentElement === this.#dialog,
			)
		if (button !== undefined) {
			this.#handleButtonClick(event, button)
			return
		}

		// A closer inside lifted content, such as the player's collapse button
		// on its floated control bar, closes the viewer, as does an opener that
		// came in with its item
		if (isWithin(event, '[data-zoom-open], [data-zoom-close]', this.#dialog)) {
			if (!event.defaultPrevented) {
				event.preventDefault()
				void this.close()
			}

			return
		}

		if (
			isWithin(
				event,
				`dialog:modal, [popover]:popover-open, ${interactiveSelector}, .amk-lightbox-caption`,
				this.#dialog,
			)
		) {
			return
		}

		// Briefly ignore the trailing click that opened the viewer, not every
		// rapid click thereafter. An intentional first click ends this guard.
		if (event.detail > 1 && performance.now() < this.#openingClickDeadline) {
			return
		}

		this.#openingClickDeadline = 0
		const slide = this.#slides[this.#index]
		// Hit-tested by position: the track captures each mouse press in case it
		// turns into a drag, and the click then targets the track
		const point = { x: event.clientX, y: event.clientY }
		const isOnSubject = slide !== undefined && isInside(point, slide.layer.getBoundingClientRect())
		if (this.#state === 'closing') {
			// The subject on its way home, or blending into its thumbnail, comes
			// back. Another item under the click takes over instead
			if (slide !== undefined && isOnSubject) {
				void this.#reopen(slide)
			} else {
				this.#openUnder(point)
			}

			return
		}

		// Another item under the click takes over from one still on its way up
		if (!isOnSubject && this.#state === 'opening' && this.#openUnder(point)) {
			return
		}

		if (slide !== undefined && this.#state === 'open') {
			// Anywhere on a zoomed slide zooms back out, rather than closing
			if (this.#zoom.current === slide) {
				this.#zoom.set(slide, undefined)
				return
			}

			const width = isInside(point, slide.layer.getBoundingClientRect())
				? zoomWidth(slide)
				: undefined
			if (width !== undefined) {
				this.#zoom.set(slide, width, point)
				return
			}
		}

		void this.close()
	}

	readonly #handleClose = () => {
		// The close event arrives a task after the dialog closes, possibly after
		// a new session has reopened it: only a dialog that is still closed was
		// closed from outside (e.g. by calling close() directly)
		if (!this.#dialog.open && this.#state !== 'idle') {
			this.restore()
		}
	}

	/** Listens on the document while open, so keys work wherever focus is. */
	readonly #handleKeydown = (event: KeyboardEvent) => {
		if (!this.#dialog.isConnected) {
			// The page replaced <body> while the viewer was open
			this.restore()
			return
		}

		if (this.#state === 'closing') {
			this.#containKeyWhileClosing(event)
			return
		}

		if (this.#isKeyForOthers(event)) {
			return
		}

		// Space closes, unless what has focus uses it: a control, anything inside
		// the lifted content, or a caption that scrolls
		if (
			event.key === ' ' &&
			!event.shiftKey &&
			!isWithin(
				event,
				`${interactiveSelector},.amk-lightbox-layer,.amk-lightbox-caption`,
				this.#dialog,
			)
		) {
			event.preventDefault()
			if (!event.repeat) {
				void this.close()
			}

			return
		}

		// Zoomed, the arrow keys pan rather than navigate, so every part of the
		// subject can be reached from the keyboard
		const { stage } =
			this.#zoom.current === this.#slides[this.#index] ? (this.#zoom.current ?? {}) : {}
		if (stage !== undefined) {
			const direction = panDirections.get(event.key)
			if (direction === undefined) {
				containScrollKey(event, this.#dialog)
			} else {
				event.preventDefault()
				stage.scrollTo({
					behavior: 'instant',
					left: stage.scrollLeft + direction[0] * panStep,
					top: stage.scrollTop + direction[1] * panStep,
				})
			}

			return
		}

		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
		if (step !== 0) {
			this.#motion.step(step * this.#motion.direction)
		} else if (event.key === 'Home') {
			// Jumps rather than scrolling past, and lifting, every slide between
			this.#motion.go(0, 'instant')
		} else if (event.key === 'End') {
			this.#motion.go(this.#slides.length - 1, 'instant')
		} else {
			containScrollKey(event, this.#dialog)
			return
		}

		this.#isKeyboardNavigated = true
		event.preventDefault()
	}

	/**
	 * A focused player keeps its keys, except Escape, which closes, and the left
	 * and right arrows, which move between items when there are others. Sliders
	 * keep their arrows, and open player popups get Escape first. Listens ahead
	 * of the player's own shortcuts.
	 */
	readonly #handlePlayerKeydown = (event: KeyboardEvent) => {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
		if (
			(event.key !== 'Escape' && (step === 0 || this.#slides.length < 2)) ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			!this.#isNavigable ||
			!isInPlayer(event, this.#dialog) ||
			isWithin(event, textEntrySelector, this.#dialog) ||
			(step !== 0 && isWithin(event, '[role="slider"]', this.#dialog)) ||
			(event.key === 'Escape' &&
				this.#dialog.querySelector(
					':scope video-player [data-popup][data-open]:not(media-tooltip)',
				) !== null)
		) {
			return
		}

		event.preventDefault()
		event.stopPropagation()
		if (step === 0) {
			void this.close()
		} else {
			this.#isKeyboardNavigated = true
			this.#motion.step(step * this.#motion.direction)
		}
	}

	readonly #handleResize = () => {
		const width = trackWidth(this.#track)
		const height = this.#track.clientHeight
		if (width === this.#width && height === this.#height) {
			return
		}

		this.#width = width
		this.#height = height
		const { target } = this.#motion
		this.#motion.resize(width)
		if (this.#state === 'idle') {
			return
		}

		for (const slide of this.#slides) {
			if (slide.lift !== undefined) {
				refreshImagePreview(slide.lift.subject)
			}

			this.#placeCaption(slide)
		}

		// Every way home was measured for the old size
		const stranded = this.#ghosts.filter((ghost) => !this.#sendHome(ghost))
		if (stranded.length > 0) {
			this.#dropGhosts(stranded)
		}

		if (this.#state === 'closing') {
			const slide = this.#slides[this.#index]
			if (slide === undefined || !this.#sendHome(slide)) {
				this.restore()
			}
		} else {
			// The zoomed size and the point it was centered on are out of date
			if (this.#zoom.current !== undefined) {
				this.#zoom.reset()
			}

			for (const slide of this.#slides) {
				prepareSlideImage(slide)
			}

			// Whether zooming would enlarge the subject depends on the stage's size
			this.#updateZoomState()
			// WebKit keeps the old pixel offset, which lands on the wrong slide
			this.#motion.go(target, 'instant')
		}
	}

	/**
	 * Make way for another item while a subject is still on its way: the current
	 * slide finishes gliding home as a ghost, out of the track's flow and under
	 * the slide that takes over, and goes back to the page once it lands. Its
	 * neighbors go back straight away.
	 */
	#handOver() {
		const isOpening = this.#state === 'opening'
		const slide = this.#slides[this.#index]
		hideControls()
		endVolumes()
		const others = this.#slides.filter((each) => each !== slide)
		this.#slides = []
		this.#activeSlide = undefined
		this.#activeSubject = undefined
		this.#motion.stop()
		this.#dismissLayer = undefined
		delete this.#dialog.dataset.dismissing
		this.#dialog.style.removeProperty('--amk-lightbox-drag-opacity')
		dropSlides(others)
		for (const other of others) {
			other.element.remove()
		}

		if (slide === undefined) {
			return
		}

		const { lift } = slide
		if (
			lift === undefined ||
			!this.#canReturn(lift) ||
			!isInViewport(lift.item.getBoundingClientRect())
		) {
			dropSlides([slide])
			slide.element.remove()
			return
		}

		if (isOpening) {
			setLayerStyle(slide.layer, this.#homeStyle(slide, lift, true))
		}

		this.#zoom.forget(slide)
		slide.element.inert = true
		slide.element.dataset.ghost = ''
		this.#ghosts.push(slide)
		void this.#settleGhost(slide)
	}

	/**
	 * The layer style that lands a lifted subject on its place in the page. While
	 * opening, the exact start values are reused, so every property retraces its
	 * path in sync instead of restarting at full duration.
	 */
	#homeStyle(slide: Slide, lift: Lift, isOpening: boolean): LayerStyle {
		// The space held in the page may have followed a resize since
		const home = lift.item.getBoundingClientRect()
		if (isLinkItem(lift.item)) {
			return isOpening && lift.from !== undefined && isSameBox(home, lift.home)
				? lift.from
				: linkStyle(slide.frame.getBoundingClientRect(), home)
		}

		const scaleX = lift.home.width > 0 ? home.width / lift.home.width : 1
		const scaleY = lift.home.height > 0 ? home.height / lift.home.height : 1
		const target: Box = {
			height: lift.offset.height * scaleY,
			width: lift.offset.width * scaleX,
			x: home.x + lift.offset.x * scaleX,
			y: home.y + lift.offset.y * scaleY,
		}
		const to =
			isOpening && lift.from !== undefined && isSameBox(target, lift.target)
				? lift.from
				: layerStyle(slide.frame.getBoundingClientRect(), target, lift)
		// Images fade out into their preview as they land.
		return canFadeHome(lift) ? { ...to, opacity: '0' } : to
	}

	/**
	 * Whether a key is for something else: one already handled or with a
	 * modifier, while closing, or on a nested dialog, a popover, or a control
	 * that uses the arrow keys itself.
	 */
	#isKeyForOthers(event: KeyboardEvent): boolean {
		return (
			event.defaultPrevented ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			!this.#isNavigable ||
			isWithin(event, 'dialog:modal, [popover]:popover-open', this.#dialog) ||
			isWithin(event, arrowKeySelector, this.#dialog)
		)
	}

	/**
	 * The item under `point` in the page, found by its box, since the page is
	 * inert under the dialog and hit testing can't reach it. Items that are
	 * hidden, lifted, or interactive, and links that would navigate, don't count.
	 * The last in document order wins, as it paints on top.
	 */
	#itemAt(point: Point): HTMLElement | undefined {
		let found: HTMLElement | undefined
		for (const item of document.querySelectorAll<HTMLElement>(itemSelector)) {
			// A link's media is instantiated to look for it, so that comes last,
			// for the item under the point alone
			if (
				!isItem(item) ||
				Object.hasOwn(item.dataset, 'zoomInteractive') ||
				isNativeLink(item) ||
				!item.checkVisibility() ||
				!isInside(point, item.getBoundingClientRect()) ||
				subjectOf(item) === undefined
			) {
				continue
			}

			found = item
		}

		return found
	}

	/**
	 * Lift a slide's subject and place its caption. A link's media is new to the
	 * viewer, so its sound is tracked from here.
	 */
	#lift(slide: Slide, measurement: Measurement) {
		liftSlide(slide, measurement)
		this.#placeCaption(slide)
		prepareSlideImage(slide)
		if (isLinkItem(measurement.item)) {
			beginVolumes([measurement.subject], undefined)
		}
	}

	/** Lift the slides within `reach` of `index` that are still in the page. */
	#liftAround(index: number, reach = 1) {
		const pending: Array<[number, Measurement]> = []
		for (let position = index - reach; position <= index + reach; position++) {
			const slide = this.#slides[position]
			const measurement = slide?.lift === undefined ? slide && measure(slide.item) : undefined
			if (measurement !== undefined) {
				pending.push([position, measurement])
			}
		}

		for (const [position, measurement] of pending) {
			this.#lift(this.#slides[position]!, measurement)
		}

		// Lay the new subjects out in this task, for WebKit's media pipeline
		pending[0]?.[1].subject.getBoundingClientRect()
		this.#activate()
	}

	/**
	 * Count a navigation button as keyboard navigation when it was pressed from
	 * the keyboard, which leaves it focus-visible. A click leaves it focused
	 * without the ring in Chromium and Firefox, and unfocused in WebKit.
	 */
	#noteKeyboardButton(button: HTMLButtonElement) {
		if (button.matches(':focus-visible')) {
			this.#isKeyboardNavigated = true
		}
	}

	/**
	 * Open the item under `point`, if there is one, taking over from the subject
	 * on its way.
	 */
	#openUnder(point: Point): boolean {
		const item = this.#itemAt(point)
		if (item === undefined || this.#openItem === undefined) {
			return false
		}

		void this.#openItem(item)
		return true
	}

	/**
	 * Put a slide's caption beside its subject when the free space there can hold
	 * it, which costs the subject nothing, or below it otherwise.
	 */
	#placeCaption(slide: Slide) {
		if (slide.caption === undefined || slide.lift === undefined) {
			return
		}

		const style = getComputedStyle(slide.element)
		const width =
			slide.element.clientWidth - lengthOf(style.paddingLeft) - lengthOf(style.paddingRight)
		const height =
			slide.element.clientHeight - lengthOf(style.paddingTop) - lengthOf(style.paddingBottom)
		const fitted = Math.min(width, height * slide.lift.ratio)
		const captionWidth = lengthOf(style.getPropertyValue('--amk-lightbox-caption-width'))
		slide.element.dataset.caption = width - fitted >= captionWidth ? 'aside' : 'below'

		// A caption that overflows scrolls, and takes focus so every keyboard can
		// scroll it
		const { caption } = slide
		if (caption.scrollHeight > caption.clientHeight) {
			caption.tabIndex = 0
		} else {
			caption.removeAttribute('tabindex')
		}
	}

	readonly #prepareZoom = (event: Event) => {
		if (
			this.#state !== 'open' ||
			(event instanceof PointerEvent && event.pointerType === 'touch')
		) {
			return
		}

		const slide = this.#slides[this.#index]
		if (
			slide?.lift === undefined ||
			this.#zoom.current === slide ||
			event.composedPath().every((node) => node !== slide.layer && node !== this.#zoomButton)
		) {
			return
		}

		const width = zoomWidth(slide)
		if (width !== undefined) {
			prepareImage(slide.lift.subject, width)
		}
	}

	/**
	 * Turn a close around before it finishes, zooming the subject back up from
	 * wherever it has got to.
	 */
	async #reopen(slide: Slide) {
		const generation = ++this.#generation
		this.#state = 'opening'
		// A player's bar floats again from the start, as it does when opening
		this.#activate()
		await this.#expand(slide, generation)
	}

	/**
	 * Once the track rests on a slide: make it the current one, snap to slides
	 * again, and finish navigating.
	 */
	#rest() {
		this.#setIndex(this.#motion.index)
		// A slide that was navigated away from is out of view by now, so it zooms
		// back out unseen rather than shrinking as it slides away
		if (this.#zoom.current !== undefined && this.#zoom.current !== this.#slides[this.#index]) {
			this.#zoom.reset()
		}

		if (this.#state === 'open') {
			dropSlides(this.#slides.filter((_slide, index) => Math.abs(index - this.#index) > 1))
		}
	}

	/**
	 * The element holding a slide's media: its subject, or its item while that is
	 * still in the page.
	 */
	#rootOf(slide: Slide): Element {
		return slide.lift?.subject ?? slide.item
	}

	/**
	 * Point a slide's layer at where its item is now, or report that it has no
	 * place to go back to.
	 */
	#sendHome(slide: Slide): boolean {
		const { lift } = slide
		if (lift === undefined || !this.#canReturn(lift)) {
			return false
		}

		setLayerStyle(slide.layer, this.#homeStyle(slide, lift, false))
		return true
	}

	/** Make `index` the current slide, lifting its neighbors ahead of time. */
	#setIndex(index: number) {
		if (index === this.#index) {
			return
		}

		this.#index = index
		const item = this.#slides[index]?.item
		this.#setPageItem(item)
		// A page carousel follows the viewer, so the slide on show is the one the
		// subject returns to. Before lifting neighbors, which keep scroll positions
		if (item !== undefined) {
			revealCarouselItem(item)
		}

		this.#liftAround(index)
		this.#updateControls()
	}

	/** Fade the previous page item's controls in as the next item's fade out. */
	#setPageItem(item: HTMLElement | undefined) {
		if (item === this.#activePageItem) {
			return
		}

		if (this.#activePageItem !== undefined) {
			delete this.#activePageItem.dataset.zoomActive
		}

		this.#activePageItem = item
		if (item !== undefined) {
			item.dataset.zoomActive = ''
		}
	}

	/**
	 * Put a ghost back in the page once it has landed, and lift it again if the
	 * gallery that took over needs it next door.
	 */
	async #settleGhost(slide: Slide) {
		await settle(slide.layer)
		const at = this.#ghosts.indexOf(slide)
		if (at === -1) {
			return
		}

		this.#ghosts.splice(at, 1)
		dropSlides([slide])
		slide.element.remove()
		if (this.#state === 'open') {
			this.#liftAround(this.#index)
		}
	}

	/**
	 * Zoom the current slide about its middle, or back out: the keyboard way to
	 * zoom.
	 */
	#toggleZoom() {
		const slide = this.#slides[this.#index]
		if (slide === undefined || this.#state !== 'open') {
			return
		}

		this.#openingClickDeadline = 0
		this.#motion.stop()
		if (this.#zoom.current === slide) {
			this.#zoom.set(slide, undefined)
		} else {
			const width = zoomWidth(slide)
			if (width === undefined) {
				return
			}

			const box = slide.layer.getBoundingClientRect()
			this.#zoom.set(slide, width, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
		}

		// A toggle button keeps focus
		this.#zoomButton.focus({ preventScroll: true })
	}

	#updateControls() {
		const count = this.#slides.length
		// Not `disabled`, which would drop keyboard focus at either end
		this.#previous.ariaDisabled = String(this.#index === 0)
		this.#next.ariaDisabled = String(this.#index === count - 1)
		// Counted here rather than in CSS, where a ghost would count as a slide
		this.#dialog.toggleAttribute('data-lone', count === 1)
		const active = this.#slides[this.#index]
		if (this.#activeSlide !== active) {
			if (this.#activeSlide !== undefined) {
				this.#activeSlide.element.inert = true
			}

			if (active !== undefined) {
				active.element.inert = false
			}

			this.#activeSlide = active
			this.#status.textContent = active === undefined ? '' : describeSlide(active)
		}

		// Focus inside a slide that just went inert would otherwise fall to
		// <body> at the next rendering update
		const focused = document.activeElement
		if (
			this.#dialog.open &&
			(focused === null || !this.#dialog.contains(focused) || focused.closest('[inert]') !== null)
		) {
			this.#dialog.focus({ preventScroll: true })
		}

		this.#updateZoomState()
		this.#activate()
	}

	/**
	 * Show the zoom button when anything in the gallery zooms, pressed while the
	 * current slide is zoomed, and disabled (not hidden, which would drop
	 * keyboard focus) when the current slide can't zoom. The current slide is
	 * marked `data-zoomable` while its subject can zoom, for the cursor, which
	 * shows it while the subject is still opening too.
	 */
	#updateZoomState() {
		const slide = this.#slides[this.#index]
		const isZoomed = slide !== undefined && this.#zoom.current === slide
		const canZoom = slide !== undefined && zoomWidth(slide) !== undefined
		for (const each of this.#slides) {
			each.element.toggleAttribute('data-zoomable', each === slide && canZoom)
		}

		this.#zoomButton.hidden = this.#slides.every((each) => !hasZoomLevel(each.item))
		this.#zoomButton.ariaPressed = String(isZoomed)
		this.#zoomButton.ariaDisabled = String(!isZoomed && (this.#state !== 'open' || !canZoom))
	}
}

let viewer: undefined | Viewer

/** Close the viewer, optionally restoring immediately before a page swap. */
export async function closeViewer(immediate = false): Promise<void> {
	if (immediate) {
		viewer?.restore()
	} else {
		await viewer?.close()
	}
}

/**
 * Open the viewer on `items[index]`, with the other items as its gallery.
 * Resolves once the opening transition has finished, to whether it opened. Does
 * nothing while the viewer is already open; while it is still opening or
 * closing, the item takes over. `openItem` is called with an item clicked under
 * the viewer meanwhile.
 */
export async function openViewer(
	items: HTMLElement[],
	index: number,
	openItem: Opener,
): Promise<boolean> {
	viewer ??= new Viewer()
	return viewer.open(items, index, openItem)
}

function createSlide(item: HTMLElement, index: number, count: number): Slide {
	const element = document.createElement('div')
	element.className = 'amk-lightbox-slide'
	element.inert = true
	element.role = 'group'
	element.ariaRoleDescription = 'slide'
	element.ariaLabel = `${index + 1} of ${count}`
	// Lifted content keeps the language and direction it had in the page
	const lang = item.closest('[lang]')?.getAttribute('lang') ?? undefined
	if (lang !== undefined) {
		element.lang = lang
	}

	element.dir = item.matches(':dir(rtl)') ? 'rtl' : 'ltr'
	const { level } = item.dataset
	if (level !== undefined) {
		element.dataset.level = level
	}

	const stage = document.createElement('div')
	stage.className = 'amk-lightbox-stage'
	// Focused while zoomed, so the keyboard scrolls it, but never a tab stop
	stage.tabIndex = -1
	const frame = document.createElement('div')
	frame.className = 'amk-lightbox-frame'
	const layer = document.createElement('div')
	layer.className = 'amk-lightbox-layer'
	frame.append(layer)
	stage.append(frame)
	element.append(stage)

	const figcaption = captionOf(item)
	let caption: HTMLElement | undefined
	if (figcaption !== undefined) {
		caption = document.createElement('div')
		caption.className = 'amk-lightbox-caption'
		for (const node of figcaption.childNodes) {
			caption.append(node.cloneNode(true))
		}

		for (const withId of caption.querySelectorAll('[id]')) {
			withId.removeAttribute('id')
		}

		// A copied control has none of the original's behavior; links still work
		for (const control of caption.querySelectorAll(
			'button, input, select, textarea, summary, [role="button"], [role="slider"], [contenteditable]',
		)) {
			control.remove()
		}

		for (const focusable of caption.querySelectorAll('[tabindex]')) {
			focusable.removeAttribute('tabindex')
		}

		element.append(caption)
	}

	return { caption, element, frame, item, layer, lift: undefined, stage }
}

/**
 * What a screen reader hears as a slide becomes current: its position, and its
 * caption or else its media's name.
 */
function describeSlide(slide: Slide): string {
	const media = slide.lift === undefined ? undefined : rendered(slide.lift.subject)
	const texts = [
		slide.caption?.textContent,
		media?.getAttribute('alt'),
		media?.getAttribute('aria-label'),
		slide.item.getAttribute('aria-label'),
	]
	const name = texts.map((text) => text?.trim() ?? '').find((text) => text !== '') ?? ''
	const label = slide.element.getAttribute('aria-label') ?? ''
	return name === '' ? label : `${label}, ${name}`
}

/** Reveal the selected slide in its page carousels without moving the document. */
function revealCarouselItem(item: Element) {
	let slide = item.closest<HTMLElement>('.amk-carousel-slide') ?? undefined
	while (slide !== undefined) {
		const track = slide.parentElement
		if (track?.classList.contains('amk-carousel-track') === true) {
			const index = [...track.children].indexOf(slide)
			const reveal = new CustomEvent('amk-carousel-reveal', { cancelable: true, detail: index })
			// Let a controller cancel its spring; tracks without one still work.
			if (track.dispatchEvent(reveal)) {
				const direction = track.matches(':dir(rtl)') ? -1 : 1
				track.scrollTo({ behavior: 'instant', left: direction * index * track.clientWidth })
			}
		}

		slide = track?.closest<HTMLElement>('.amk-carousel-slide') ?? undefined
	}
}

function isInViewport(box: Box): boolean {
	return (
		box.x + box.width > 0 &&
		box.y + box.height > 0 &&
		box.x < window.innerWidth &&
		box.y < window.innerHeight
	)
}

function isInside(point: Point, box: Box): boolean {
	return (
		point.x >= box.x &&
		point.y >= box.y &&
		point.x <= box.x + box.width &&
		point.y <= box.y + box.height
	)
}

function isSameBox(a: Box, b: Box): boolean {
	return (
		Math.abs(a.x - b.x) < 0.5 &&
		Math.abs(a.y - b.y) < 0.5 &&
		Math.abs(a.width - b.width) < 0.5 &&
		Math.abs(a.height - b.height) < 0.5
	)
}

function preventDefault(event: Event) {
	event.preventDefault()
}

function query<T extends Element>(
	root: ParentNode,
	selector: string,
	type: abstract new () => T,
): T {
	const element = root.querySelector(selector)
	if (!(element instanceof type)) {
		throw new TypeError(`[astro-media-kit] Lightbox template is missing "${selector}"`)
	}

	return element
}
