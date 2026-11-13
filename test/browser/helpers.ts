import { expect } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { lengthOf } from '../../src/components/internal/lightbox/geometry'
import { installLightbox } from '../../src/components/internal/lightbox/lightbox'
import '../../src/components/internal/lightbox/lightbox.css'
import trackpad from '../fixtures/safari-trackpad-swipes.json'

declare module 'vitest/browser' {
	// eslint-disable-next-line ts/consistent-type-definitions -- Declaration merging requires an interface
	interface BrowserCommands {
		displayWithoutScripts: (path: string, selector: string) => Promise<false | string>
		emulateReducedMotion: (isReduced: boolean) => Promise<void>
		mouseDown: (x: number, y: number) => Promise<void>
		mouseFlick: (x: number, y: number) => Promise<void>
		mouseMove: (x: number, y: number) => Promise<void>
		mouseUp: () => Promise<void>
		mouseWheel: (deltaX: number, deltaY: number) => Promise<void>
		touchDown: (x: number, y: number) => Promise<boolean>
		touchMove: (x: number, y: number) => Promise<void>
		touchSwipe: (direction?: 'down' | 'left' | 'up') => Promise<boolean>
		touchUp: () => Promise<void>
		wheelSwipe: (
			x: number,
			y: number,
			events: Array<[time: number, deltaX: number, deltaY: number]>,
		) => Promise<void>
	}
}

const fixtures: Element[] = []

/**
 * Listen for items as the script `<Zoomer>` loads does, once per page, and use
 * fast but non-zero transitions, set the way a page would customize them.
 */
export function setUpLightbox() {
	installLightbox()
	const speed = document.createElement('style')
	speed.textContent =
		'.amk-lightbox { --amk-lightbox-duration: 80ms; --amk-lightbox-carousel-duration: 80ms; }'
	document.head.append(speed)
}

/** Add `html` to the page in a fixture of its own. */
export function mount(html: string): HTMLElement {
	const fixture = document.createElement('div')
	fixture.innerHTML = html
	document.body.append(fixture)
	fixtures.push(fixture)
	return fixture
}

/**
 * Add a page the Astro fixture built, as the components rendered it: its body
 * in a fixture of its own, and its styles in the head. Its scripts are left
 * out, since the test page runs the lightbox itself.
 */
export async function mountPage(path: string): Promise<HTMLElement> {
	const response = await fetch(`${path}index.html`)
	if (!response.ok) {
		throw new Error(`The fixture page ${path} did not build (${String(response.status)})`)
	}

	const page = new DOMParser().parseFromString(await response.text(), 'text/html')
	const loading: Array<Promise<unknown>> = []
	for (const style of page.head.querySelectorAll('style, link[rel="stylesheet"]')) {
		document.head.append(style)
		fixtures.push(style)
		if (style instanceof HTMLLinkElement) {
			loading.push(
				new Promise((resolve) => {
					style.addEventListener('load', resolve, { once: true })
					style.addEventListener('error', resolve, { once: true })
				}),
			)
		}
	}

	await Promise.all(loading)

	const fixture = document.createElement('div')
	for (const script of page.body.querySelectorAll('script')) {
		script.remove()
	}

	fixture.append(...page.body.childNodes)
	document.body.append(fixture)
	fixtures.push(fixture)
	return fixture
}

/** The element matching `selector`, which must exist and be of `type`. */
export function query(root: ParentNode, selector: string): HTMLElement
export function query<T extends Element>(
	root: ParentNode,
	selector: string,
	type: abstract new () => T,
): T
export function query(
	root: ParentNode,
	selector: string,
	type: abstract new () => Element = HTMLElement,
): Element {
	const element = root.querySelector(selector)
	if (!(element instanceof type)) {
		throw new TypeError(`Expected a ${type.name} matching "${selector}"`)
	}

	return element
}

/** Every item in `root`. */
export function boxes(root: ParentNode): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>('.amk-zoom')]
}

/** The viewer's dialog. */
export function viewer(): HTMLDialogElement {
	return query(document, 'dialog.amk-lightbox', HTMLDialogElement)
}

/** The position label of the active slide, such as "1 of 3". */
export function activeSlideLabel(): string {
	return query(document, '.amk-lightbox-slide:not([inert])').getAttribute('aria-label') ?? ''
}

/** How far the track is scrolled from the first slide, in pixels. */
export function trackOffset(): number {
	return Math.abs(query(document, '.amk-lightbox-track').scrollLeft)
}

/**
 * A two-finger swipe recorded on a MacBook trackpad in Safari, by name, as
 * events of [ms since the first, deltaX, deltaY].
 */
export function trackpadSwipe(name: string): Array<[number, number, number]> {
	const swipe = trackpad.swipes.find((each) => each.name === name)
	if (swipe === undefined) {
		throw new Error(`No recorded trackpad swipe is named "${name}"`)
	}

	return swipe.events as Array<[number, number, number]>
}

/**
 * Replay recorded wheel events on what is at a point in the viewport, each at
 * the time it was recorded. They are dispatched in the page, since browser
 * automation can deliver real input at half the pace, and the pace is what
 * tells a flick from a drag.
 */
export async function replayWheel(
	x: number,
	y: number,
	events: Array<[number, number, number]>,
): Promise<void> {
	const target = document.elementFromPoint(x, y)
	if (target === null) {
		throw new Error(`Nothing is at ${String(x)}, ${String(y)} to receive wheel events`)
	}

	const start = performance.now()
	for (const [time, deltaX, deltaY] of events) {
		const wait = start + time - performance.now()
		if (wait > 0) {
			await new Promise((resolve) => {
				setTimeout(resolve, wait)
			})
		}

		const event = new WheelEvent('wheel', {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
			deltaMode: WheelEvent.DOM_DELTA_PIXEL,
			deltaX,
			deltaY,
		})
		// When the trackpad sent it, as a real event says, rather than when a busy
		// page got round to dispatching it
		Object.defineProperty(event, 'timeStamp', { value: start + time })
		target.dispatchEvent(event)
	}
}

/** How far apart the viewer's slides rest: its width and the gap between them. */
export function slideSpacing(): number {
	return query(document, '.amk-lightbox-track').clientWidth
}

/** How far the track is pulled aside, past either end, in pixels. */
export function trackShift(): number {
	const track = query(document, '.amk-lightbox-track')
	// At rest, its margin puts half the gap between slides past the viewer's edge
	const rest =
		track.parentElement!.getBoundingClientRect().x + lengthOf(getComputedStyle(track).marginLeft)
	return track.getBoundingClientRect().x - rest
}

/** Whether `box` has its subject lifted into the viewer. */
export function isLifted(box: HTMLElement): boolean {
	return Object.hasOwn(box.dataset, 'lifted')
}

/** Ask the viewer to close and wait until it has. */
export async function close(): Promise<void> {
	const dialog = viewer()
	dialog.requestClose()
	await expect.poll(() => dialog.open).toBe(false)
}

/** Give the browser time to do something it shouldn't. */
export async function settle(ms = 300): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

/** Wait for `count` animation frames. */
export async function frames(count = 2): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => {
				resolve()
			})
		})
	}
}

/**
 * The wrapper `<Zoomer>` renders around plain content: a button, with the given
 * extra attributes.
 */
export function item(content: string, attributes = ''): string {
	return `<div class="amk-zoom" role="button" tabindex="0" aria-haspopup="dialog" ${attributes}>${content}</div>`
}

/**
 * The wrapper `<Zoomer>` renders around a player: not a button, and
 * interactive.
 */
export function playerItem(content: string, attributes = ''): string {
	return `<div class="amk-zoom" data-zoom-interactive="" ${attributes}>${content}</div>`
}

/** The wrapper `<Zoomer>` renders with a fallback link. */
export function link(href: string, content: string, attributes = ''): string {
	return `<a class="amk-zoom" href="${href}" aria-haspopup="dialog" ${attributes}>${content}</a>`
}

/** A plain colored box to lift, labeled for identification. */
export function block(label: string, style = 'width: 240px; height: 160px'): string {
	return `<div class="subject" data-label="${label}" style="${style}; background: teal"></div>`
}

/** A gallery of blocks with the given labels. */
export function gallery(labels: string[]): string {
	return labels.map((label) => item(block(label), 'data-gallery="g"')).join('')
}

/** A responsive image item, 240px wide, whose placeholder is a faithful copy. */
export function imageItem(attributes = '', name = 'tile', search = ''): string {
	return item(
		`<img src="/media/${name}-480.jpg${search}" alt="" sizes="240px" width="2400" height="2400"
			srcset="/media/${name}-480.jpg${search} 480w, /media/${name}-960.jpg${search} 960w, /media/${name}-2400.jpg${search} 2400w"
			style="width: 100%; height: auto" />`,
		`${attributes} style="width: 240px"`,
	)
}

/**
 * A responsive image item that zooms to `level`, with the native width the
 * components render from the largest candidate.
 */
export function zoomable(level: string, name = 'tile', height = 2400): string {
	return item(
		`<img src="/media/${name}-480.jpg" alt="" loading="lazy" sizes="auto" width="2400" height="${height}"
			srcset="/media/${name}-480.jpg 480w, /media/${name}-960.jpg 960w, /media/${name}-2400.jpg 2400w"
			style="width: 100%; height: auto" />`,
		`data-gallery="z" data-level="${level}" data-native-width="2400" style="width: 240px"`,
	)
}

/** The current slide's layer, which shows the subject wherever it is drawn. */
export function currentLayer(): HTMLElement {
	return query(document, '.amk-lightbox-slide:not([inert]) .amk-lightbox-layer')
}

/** The current slide's stage, which scrolls while zoomed. */
export function currentStage(): HTMLElement {
	return query(document, '.amk-lightbox-slide:not([inert]) .amk-lightbox-stage')
}

/** Wait until no animation in the viewer is running, and its end is rendered. */
export async function transitionsDone(): Promise<void> {
	await expect
		.poll(() =>
			viewer()
				.getAnimations({ subtree: true })
				.every((a) => a.playState !== 'running'),
		)
		.toBe(true)
	// WebKit reports a transition finished before the frame that applies its
	// end, and geometry read in between is the previous frame's
	await frames(1)
}

/**
 * Wait until the current subject's lift has settled, and its end is rendered,
 * leaving any animation the lifted content runs on its own, such as a player's
 * spinner, out of it.
 */
export async function liftDone(timeout = 1000): Promise<void> {
	await expect
		.poll(
			() =>
				currentLayer()
					.getAnimations()
					.every((a) => a.playState !== 'running'),
			{ timeout },
		)
		.toBe(true)
	// WebKit's geometry lags a finished transition by a frame, as in transitionsDone
	await frames(1)
}

/** Click the current subject at a fraction of its size, and return that point. */
export async function clickSubject(x: number, y: number): Promise<{ x: number; y: number }> {
	const box = currentLayer().getBoundingClientRect()
	const position = { x: Math.round(box.width * x), y: Math.round(box.height * y) }
	await userEvent.click(currentLayer(), { position })
	return { x: box.x + position.x, y: box.y + position.y }
}

/** The opacity transition running on `element`, if there is one. */
export function fadeOf(element: Element): CSSTransition | undefined {
	return element
		.getAnimations()
		.find(
			(animation): animation is CSSTransition =>
				animation instanceof CSSTransition && animation.transitionProperty === 'opacity',
		)
}

/** The middle of where `element` is drawn now, in viewport coordinates. */
export function middleOf(element: Element): { x: number; y: number } {
	const box = element.getBoundingClientRect()
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Click the middle of where `element` is drawn now, even mid-transition. The
 * click can be prevented, as a real one can, so a link's own navigation waits
 * on the handlers.
 */
export function clickMiddle(element: Element) {
	const { x, y } = middleOf(element)
	element.dispatchEvent(
		new MouseEvent('click', {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
			detail: 1,
		}),
	)
}

/**
 * Click the viewer at a point in the viewport, as a click meant for the page
 * under it lands.
 */
export function clickViewerAt({ x, y }: { x: number; y: number }) {
	viewer().dispatchEvent(
		new MouseEvent('click', {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
			detail: 1,
		}),
	)
}

/** Release the mouse, close the viewer, and remove every mounted fixture. */
export async function cleanUp(): Promise<void> {
	// A test that fails mid-drag would otherwise leave the button held for the next
	await commands.mouseUp()
	const dialog = document.querySelector<HTMLDialogElement>('dialog.amk-lightbox')
	if (dialog?.open) {
		await close()
	}

	for (const fixture of fixtures.splice(0)) {
		fixture.remove()
	}

	// The next hover must enter its target even if a new fixture has the same layout.
	await commands.mouseMove(5, 5)
}
