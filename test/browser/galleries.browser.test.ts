import { afterEach, describe, expect, it, vi } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { subjectOf } from '../../src/components/internal/lightbox/dom'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	block,
	boxes,
	cleanUp,
	currentLayer,
	currentStage,
	gallery,
	isLifted,
	item,
	mount,
	playerItem,
	query,
	settle,
	setUpLightbox,
	trackOffset,
	trackShift,
	transitionsDone,
	viewer,
	zoomable,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

describe('galleries', () => {
	it('times carousel glides independently from zoom, including CSS time calculations', async () => {
		const fixture = mount(gallery(['a', 'b']))
		await openLightbox(boxes(fixture)[0]!)
		const track = query(document, '.amk-lightbox-track')
		try {
			viewer().style.setProperty('--amk-lightbox-duration', '2s')
			viewer().style.setProperty('--amk-lightbox-carousel-duration', '0ms')
			query(document, '.amk-lightbox-next').click()
			expect(trackOffset()).toBe(track.clientWidth)
			expect(getComputedStyle(currentLayer()).transitionDuration).toBe('2s, 2s, 2s, 0.3s')

			viewer().style.setProperty('--amk-lightbox-duration', '0s')
			viewer().style.setProperty('--amk-lightbox-carousel-duration', 'calc(600ms + 400ms)')
			query(document, '.amk-lightbox-previous').click()
			expect(getComputedStyle(track).transitionDuration).toBe('1s')
			expect(Object.hasOwn(track.dataset, 'moving')).toBe(true)
			await settle(80)
			expect(trackOffset()).toBeGreaterThan(0)
			expect(trackOffset()).toBeLessThan(track.clientWidth)
			expect(getComputedStyle(currentLayer()).transitionDuration).toBe('0s, 0s, 0s, 0.3s')
		} finally {
			viewer().style.removeProperty('--amk-lightbox-duration')
			viewer().style.removeProperty('--amk-lightbox-carousel-duration')
		}
	})

	it('opens a named gallery at the clicked item, in document order', async () => {
		const fixture = mount(`
			${item(block('a'), 'data-gallery="g"')}
			${item(block('x'), 'data-gallery="other"')}
			${item(block('b'), 'data-gallery="g"')}
			${item(block('c'), 'data-gallery="g"')}`)

		await openLightbox(boxes(fixture)[2]!)

		const labels = Array.from(
			document.querySelectorAll<HTMLElement>('.amk-lightbox-slide .subject'),
			(subject) => subject.dataset.label,
		)
		expect(labels).toEqual(['a', 'b', 'c'])
		expect(activeSlideLabel()).toBe('2 of 3')
		const track = query(document, '.amk-lightbox-track')
		expect(track.scrollLeft).toBeCloseTo(track.clientWidth, -1)
		expect(query(fixture, '[data-label="x"]').parentElement?.tagName).toBe('DIV')
	})

	it('opens items added to the page later, without any setup', async () => {
		const fixture = mount('')
		fixture.innerHTML = gallery(['late', 'later'])

		await userEvent.click(boxes(fixture)[1]!)

		await expect.poll(() => viewer().dataset.state).toBe('open')
		expect(activeSlideLabel()).toBe('2 of 2')
	})

	it('keeps same-named galleries in different scopes apart', async () => {
		const fixture = mount(`
			<section class="post">${item(block('a'), 'data-gallery="g" data-scope=".post"')}
				${item(block('b'), 'data-gallery="g" data-scope=".post"')}</section>
			<section class="post">${item(block('c'), 'data-gallery="g" data-scope=".post"')}</section>`)

		await openLightbox(boxes(fixture)[2]!)

		expect(document.querySelectorAll('.amk-lightbox-slide')).toHaveLength(1)
	})

	it('groups unnamed items that share a scope', async () => {
		const fixture = mount(`
			<section class="post">${item(block('a'), 'data-scope=".post"')}
				${item(block('b'), 'data-scope=".post"')}</section>
			${item(block('c'))}`)

		await openLightbox(boxes(fixture)[0]!)

		expect(document.querySelectorAll('.amk-lightbox-slide')).toHaveLength(2)
	})

	it('opens alone, with a warning, when its scope matches no ancestor', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
			// Keeps the expected warning out of the test output
		})
		try {
			const fixture = mount(
				gallery(['a', 'b']).replaceAll(
					'data-gallery="g"',
					'data-gallery="g" data-scope=".missing"',
				),
			)

			await openLightbox(boxes(fixture)[0]!)

			expect(document.querySelectorAll('.amk-lightbox-slide')).toHaveLength(1)
			expect(warn).toHaveBeenCalledOnce()
		} finally {
			warn.mockRestore()
		}
	})

	it('names an invalid scope selector', async () => {
		const fixture = mount(item(block('a'), 'data-scope="["'))
		await expect(openLightbox(boxes(fixture)[0]!)).rejects.toThrow(
			'zoomScope "[" is not a valid CSS selector',
		)
	})

	it('navigates with the buttons and disables them at the ends', async () => {
		const fixture = mount(gallery(['a', 'b', 'c']))
		await openLightbox(boxes(fixture)[0]!)
		const previous = query(document, '.amk-lightbox-previous', HTMLButtonElement)
		const next = query(document, '.amk-lightbox-next', HTMLButtonElement)

		expect(previous.ariaDisabled).toBe('true')
		await userEvent.click(next)
		await expect.poll(activeSlideLabel).toBe('2 of 3')
		await userEvent.click(next)
		await expect.poll(activeSlideLabel).toBe('3 of 3')
		await expect.poll(() => next.ariaDisabled).toBe('true')
		expect(previous.ariaDisabled).toBe('false')
		await userEvent.click(previous)
		await expect.poll(activeSlideLabel).toBe('2 of 3')
	})

	it('navigates with the arrow keys, Home and End', async () => {
		const fixture = mount(gallery(['a', 'b', 'c', 'd']))
		await openLightbox(boxes(fixture)[1]!)

		await userEvent.keyboard('{ArrowRight}')
		await expect.poll(activeSlideLabel).toBe('3 of 4')
		await userEvent.keyboard('{ArrowLeft}')
		await expect.poll(activeSlideLabel).toBe('2 of 4')
		await userEvent.keyboard('{End}')
		await expect.poll(activeSlideLabel).toBe('4 of 4')
		await userEvent.keyboard('{Home}')
		await expect.poll(activeSlideLabel).toBe('1 of 4')
	})

	it('counts every press while the previous one is still scrolling', async () => {
		const fixture = mount(gallery(['a', 'b', 'c', 'd']))
		await openLightbox(boxes(fixture)[0]!)

		await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')

		await expect.poll(activeSlideLabel).toBe('4 of 4')
	})

	it('leaves the arrow keys to inputs inside a lifted element', async () => {
		const fixture = mount(`
			${item('<div class="subject"><input aria-label="Note" value="hello" /></div>', 'data-gallery="g"')}
			${gallery(['b'])}`)
		await openLightbox(boxes(fixture)[0]!)

		const input = query(document, '.amk-lightbox-slide:not([inert]) input', HTMLInputElement)
		input.focus()
		input.setSelectionRange(2, 2)
		await userEvent.keyboard('{ArrowRight}')
		await settle()

		expect(input.selectionStart).toBe(3)
		expect(activeSlideLabel()).toBe('1 of 2')
	})

	it('navigates by dragging with the mouse, without closing', async () => {
		const fixture = mount(gallery(['a', 'b', 'c']))
		await openLightbox(boxes(fixture)[0]!)

		const frame = query(document, '.amk-lightbox-slide:not([inert]) .amk-lightbox-frame')
		const box = frame.getBoundingClientRect()
		const y = box.y + box.height / 2
		await commands.mouseDown(box.right - 5, y)
		await commands.mouseMove(5, y)
		await commands.mouseUp()

		await expect.poll(activeSlideLabel).toBe('2 of 3')
		await settle()
		expect(viewer().open).toBe(true)
	})

	it('navigates by dragging an image, not only the space around it', async () => {
		const fixture = mount(
			['a', 'b', 'c']
				.map((label) =>
					item(
						`<img src="/media/tile-480.jpg" alt="${label}" width="480" height="480" />`,
						'data-gallery="g"',
					),
				)
				.join(''),
		)
		const image = query(fixture, 'img', HTMLImageElement)
		await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true)
		await openLightbox(boxes(fixture)[0]!)

		const box = image.getBoundingClientRect()
		const y = box.y + box.height / 2
		await commands.mouseDown(box.right - 16, y)
		await commands.mouseMove(5, y)
		await commands.mouseUp()

		await expect.poll(trackOffset).toBe(1280)
		expect(activeSlideLabel()).toBe('2 of 3')
		await settle()
		expect(viewer().open).toBe(true)
	})

	it.each([-1, 1])('dismisses an image with a vertical drag in direction %i', async (direction) => {
		const fixture = mount(zoomable('fit'))
		await expect.poll(() => query(fixture, 'img', HTMLImageElement).naturalWidth).toBeGreaterThan(0)
		const original = query(fixture, 'img', HTMLImageElement)
		await openLightbox(boxes(fixture)[0]!)
		const home = currentLayer().getBoundingClientRect()
		expect(getComputedStyle(currentLayer()).touchAction).toBe('pan-x pinch-zoom')
		await commands.mouseDown(640, 400)
		await commands.mouseMove(640, 400 + direction * 100)
		expect(currentLayer().getBoundingClientRect().y).toBeCloseTo(home.y + direction * 100, 0)
		expect(Number(getComputedStyle(viewer(), '::backdrop').opacity)).toBeCloseTo(0.75, 1)
		expect(trackOffset()).toBe(0)
		await commands.mouseMove(640, 400 + direction * 220)
		expect(Number(getComputedStyle(viewer(), '::backdrop').opacity)).toBeLessThan(0.5)
		await commands.mouseUp()
		await expect.poll(() => viewer().open).toBe(false)
		expect(boxes(fixture)[0]!.contains(original)).toBe(true)
		expect(viewer().style.getPropertyValue('--amk-lightbox-drag-opacity')).toBe('')
	})

	it('dismisses ordinary HTML with a vertical drag', async () => {
		const fixture = mount(item(block('a')))
		await openLightbox(boxes(fixture)[0]!)
		await commands.mouseDown(640, 400)
		await commands.mouseMove(640, 620)
		expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(true)
		await commands.mouseUp()
		await expect.poll(() => viewer().open).toBe(false)
	})

	it('leaves a player its presses and drags, except a clearly vertical one', async () => {
		const fixture = mount(
			playerItem(`
				<div data-interactive="" style="width: 240px; height: 160px; background: teal">
					<button type="button" style="width: 40px; height: 40px">Play</button>
				</div>`),
		)
		await openLightbox(boxes(fixture)[0]!)
		const player = query(viewer(), '[data-interactive]')
		const pressed: boolean[] = []
		const clicks: EventTarget[] = []
		const listening = new AbortController()
		addEventListener(
			'pointerdown',
			(event) => {
				pressed.push(event.defaultPrevented)
			},
			{ signal: listening.signal },
		)
		player.addEventListener(
			'click',
			(event) => {
				clicks.push(event.target!)
			},
			{ signal: listening.signal },
		)
		try {
			await commands.mouseDown(640, 400)
			await commands.mouseUp()
			expect(pressed).toEqual([false])
			expect(clicks).toEqual([player])

			await commands.mouseDown(640, 400)
			await commands.mouseMove(760, 430)
			expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)
			expect(trackShift()).toBe(0)
			await commands.mouseUp()

			const button = query(player, 'button').getBoundingClientRect()
			await commands.mouseDown(button.x + 20, button.y + 20)
			await commands.mouseMove(button.x + 20, button.y + 240)
			expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)
			await commands.mouseUp()
			expect(viewer().open).toBe(true)

			await commands.mouseDown(640, 400)
			await commands.mouseMove(650, 620)
			expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(true)
			await commands.mouseUp()
			await expect.poll(() => viewer().open).toBe(false)
		} finally {
			listening.abort()
		}
	})

	it('dismisses a video with native controls with a vertical drag', async () => {
		const fixture = mount(
			playerItem(`
				<video controls muted width="1280" height="720" src="/media/loop.mp4" aria-label="Loop"
					style="width: 240px; height: auto"></video>`),
		)
		await openLightbox(boxes(fixture)[0]!)
		await commands.mouseDown(640, 400)
		await commands.mouseMove(645, 620)
		expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(true)
		await commands.mouseUp()
		await expect.poll(() => viewer().open).toBe(false)
	})

	it('springs back after a short vertical drag without clicking or zooming', async () => {
		const fixture = mount(zoomable('native'))
		await expect.poll(() => query(fixture, 'img', HTMLImageElement).naturalWidth).toBeGreaterThan(0)
		await openLightbox(boxes(fixture)[0]!)
		const home = currentLayer().getBoundingClientRect()
		await commands.mouseDown(640, 400)
		await commands.mouseMove(642, 480)
		expect(currentLayer().getBoundingClientRect().y).toBeCloseTo(home.y + 80, 0)
		await settle(150)
		await commands.mouseUp()
		await transitionsDone()
		expect(viewer().open).toBe(true)
		expect(currentLayer().getBoundingClientRect().y).toBeCloseTo(home.y, 0)
		expect(Number(getComputedStyle(viewer(), '::backdrop').opacity)).toBe(1)
		expect(viewer().querySelector('[data-zoomed]')).toBeNull()
	})

	it('dismisses a short vertical flick without requiring the full drag distance', async () => {
		const fixture = mount(zoomable('fit'))
		await expect.poll(() => query(fixture, 'img', HTMLImageElement).naturalWidth).toBeGreaterThan(0)
		await openLightbox(boxes(fixture)[0]!)
		await commands.mouseDown(640, 400)
		await commands.mouseFlick(640, 480)
		await expect.poll(() => viewer().open).toBe(false)
	})

	it('cleans up a vertical drag interrupted by Escape before reopening', async () => {
		const fixture = mount(zoomable('fit'))
		await expect.poll(() => query(fixture, 'img', HTMLImageElement).naturalWidth).toBeGreaterThan(0)
		await openLightbox(boxes(fixture)[0]!)
		await commands.mouseDown(640, 400)
		await commands.mouseMove(640, 500)
		await userEvent.keyboard('{Escape}')
		await commands.mouseUp()
		await expect.poll(() => viewer().open).toBe(false)
		await openLightbox(boxes(fixture)[0]!)
		expect(Number(getComputedStyle(viewer(), '::backdrop').opacity)).toBe(1)
		expect(currentLayer().style.translate).toBe('none')
		expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)
	})

	it('cancels a vertical dismissal when pointer capture is lost', async () => {
		const fixture = mount(zoomable('fit'))
		await expect.poll(() => query(fixture, 'img', HTMLImageElement).naturalWidth).toBeGreaterThan(0)
		await openLightbox(boxes(fixture)[0]!)
		const track = query(document, '.amk-lightbox-track')
		let pointerId = 0
		track.addEventListener(
			'pointerdown',
			(event) => {
				pointerId = event.pointerId
			},
			{ once: true },
		)
		await commands.mouseDown(640, 400)
		await commands.mouseMove(640, 650)
		track.releasePointerCapture(pointerId)
		await commands.mouseMove(640, 651)
		await commands.mouseUp()
		await transitionsDone()
		expect(viewer().open).toBe(true)
		expect(currentLayer().style.translate).toBe('none')
		expect(Number(getComputedStyle(viewer(), '::backdrop').opacity)).toBe(1)
	})

	it('drags across text without selecting it, focusing the stage as a press would', async () => {
		const fixture = mount(
			['a', 'b', 'c']
				.map((label) =>
					item(
						`<div class="subject" style="width: 240px; height: 160px; display: grid; place-items: center; font-size: 48px">
							Words to drag across ${label}
						</div>`,
						'data-gallery="g"',
					),
				)
				.join(''),
		)
		await openLightbox(boxes(fixture)[0]!)

		await commands.mouseDown(700, 400)
		expect(document.activeElement).toBe(currentStage())
		await commands.mouseMove(560, 400)
		await settle()
		await commands.mouseUp()

		await expect.poll(trackOffset).toBe(0)
		expect(document.getSelection()?.toString()).toBe('')
	})

	it('glides to the next slide, even where the browser jumps smooth scrolls', async () => {
		const fixture = mount(gallery(['a', 'b', 'c']))
		await openLightbox(boxes(fixture)[0]!)
		const offsets: number[] = []
		const record = () => {
			offsets.push(trackOffset())
			if (offsets.length < 90) {
				requestAnimationFrame(record)
			}
		}

		requestAnimationFrame(record)
		await userEvent.click(query(document, '.amk-lightbox-next'))

		await expect.poll(trackOffset).toBe(1280)
		await expect.poll(() => offsets.some((offset) => offset > 0 && offset < 1280)).toBe(true)
	})

	it('gives way less and less when dragged past either end, then springs back', async () => {
		const fixture = mount(gallery(['a', 'b']))
		await openLightbox(boxes(fixture)[0]!)

		await commands.mouseDown(300, 400)
		await commands.mouseMove(700, 400)
		expect(trackShift()).toBeGreaterThan(50)
		expect(trackShift()).toBeLessThan(400)
		await commands.mouseUp()
		await expect.poll(trackShift).toBe(0)
		expect(trackOffset()).toBe(0)

		await userEvent.keyboard('{End}')
		await commands.mouseDown(900, 400)
		await commands.mouseMove(500, 400)
		expect(trackShift()).toBeLessThan(-50)
		expect(trackShift()).toBeGreaterThan(-400)
		await commands.mouseUp()
		await expect.poll(trackShift).toBe(0)
		expect(trackOffset()).toBe(1280)
	})

	it.for([
		{ html: zoomable('fit'), name: 'image' },
		{ html: item(block('a')), name: 'card' },
	])('gives way when a lone $name is dragged sideways, then springs back', async ({ html }) => {
		const fixture = mount(html)
		await openLightbox(boxes(fixture)[0]!)
		for (const direction of [1, -1]) {
			await commands.mouseDown(640, 400)
			await commands.mouseMove(640 + direction * 260, 400)
			expect(trackShift() * direction).toBeGreaterThan(50)
			expect(trackShift() * direction).toBeLessThan(260)
			await commands.mouseUp()
			await expect.poll(trackShift).toBe(0)
		}

		await settle(150)
		expect(viewer().open).toBe(true)
		expect(activeSlideLabel()).toBe('1 of 1')
	})

	it('goes on to the next slide when a short drag is let go still moving', async () => {
		const fixture = mount(gallery(['a', 'b', 'c']))
		await openLightbox(boxes(fixture)[0]!)

		await commands.mouseDown(900, 400)
		await commands.mouseFlick(780, 400)

		await expect.poll(trackOffset).toBe(1280)
		expect(activeSlideLabel()).toBe('2 of 3')
	})

	it('holds the track wherever a drag pauses, then settles on the nearest slide', async () => {
		const fixture = mount(gallery(['a', 'b', 'c']))
		await openLightbox(boxes(fixture)[0]!)

		await commands.mouseDown(1100, 400)
		await commands.mouseMove(716, 400)
		await settle()
		expect(trackOffset()).toBeCloseTo(384, -1)
		await commands.mouseUp()
		await expect.poll(trackOffset).toBe(0)

		await commands.mouseDown(1100, 400)
		await commands.mouseMove(300, 400)
		await settle()
		await commands.mouseUp()
		await expect.poll(trackOffset).toBe(1280)
		expect(activeSlideLabel()).toBe('2 of 3')
	})

	it('goes back when a drag is swung back before letting go', async () => {
		const fixture = mount(gallery(['a', 'b', 'c']))
		await openLightbox(boxes(fixture)[0]!)

		await commands.mouseDown(1100, 400)
		await commands.mouseMove(300, 400)
		await settle()
		await commands.mouseFlick(400, 400)

		await expect.poll(trackOffset).toBe(0)
		expect(activeSlideLabel()).toBe('1 of 3')
	})

	it('lets go of a drag when it closes', async () => {
		const fixture = mount(gallery(['a', 'b', 'c']))
		const items = boxes(fixture)
		await openLightbox(items[0]!)
		// Long enough to look in on the close while it animates
		viewer().style.setProperty('--amk-lightbox-duration', '10s')

		try {
			await commands.mouseDown(900, 400)
			await commands.mouseMove(700, 400)
			await userEvent.keyboard('{Escape}')
			await commands.mouseUp(500, 400)
			await settle(100)

			expect(trackOffset()).toBe(0)
			expect(isLifted(items[1]!)).toBe(false)
		} finally {
			const animations = viewer().getAnimations({ subtree: true })
			for (const animation of animations) {
				animation.finish()
			}

			viewer().style.removeProperty('--amk-lightbox-duration')
		}

		await expect.poll(() => viewer().open).toBe(false)
	})

	it('keeps keyboard focus in the viewer when the focused slide goes inert', async () => {
		const fixture = mount(
			['a', 'b', 'c']
				.map(
					(label) => `
						<figure>
							${item(block(label), 'data-gallery="g"')}
							<figcaption><a href="#${label}">Link ${label}</a></figcaption>
						</figure>`,
				)
				.join(''),
		)
		await openLightbox(boxes(fixture)[0]!)

		query(document, '.amk-lightbox-slide:not([inert]) .amk-lightbox-caption a').focus()
		await userEvent.keyboard('{ArrowRight}')
		await expect.poll(activeSlideLabel).toBe('2 of 3')

		await expect.poll(() => viewer().contains(document.activeElement)).toBe(true)
		await userEvent.keyboard('{ArrowRight}')
		await expect.poll(activeSlideLabel).toBe('3 of 3')
	})

	it('returns to the item that is showing when it closes, and focuses it', async () => {
		const fixture = mount(gallery(['a', 'b', 'c']))
		const items = boxes(fixture)
		await openLightbox(items[0]!)

		await userEvent.keyboard('{ArrowRight}')
		await userEvent.keyboard('{ArrowRight}')
		await expect.poll(activeSlideLabel).toBe('3 of 3')
		await close()

		for (const [index, each] of items.entries()) {
			expect(subjectOf(each)?.parentElement).toBe(items[index])
		}

		expect(document.activeElement).toBe(items[2])
	})

	it('keeps neighbors in the page while animating, so their places never visibly empty', async () => {
		const fixture = mount(gallery(['a', 'b', 'c']))
		const items = boxes(fixture)

		const opening = openLightbox(items[1]!)
		expect(items.map((each) => isLifted(each))).toEqual([false, true, false])
		await opening
		expect(items.map((each) => isLifted(each))).toEqual([true, true, true])

		viewer().requestClose()
		expect(items.map((each) => isLifted(each))).toEqual([false, true, false])
		await expect.poll(() => viewer().open).toBe(false)
		expect(items.map((each) => isLifted(each))).toEqual([false, false, false])
	})

	it('lifts only the open item and its neighbors, then more as it navigates', async () => {
		const fixture = mount(gallery(['a', 'b', 'c', 'd', 'e']))
		const items = boxes(fixture)
		const lifted = () => items.map((each) => isLifted(each))

		await openLightbox(items[0]!)
		expect(lifted()).toEqual([true, true, false, false, false])
		await userEvent.keyboard('{ArrowRight}')
		await expect.poll(lifted).toEqual([true, true, true, false, false])
		await close()

		expect(lifted()).toEqual([false, false, false, false, false])
		for (const each of items) {
			expect(subjectOf(each)?.parentElement).toBe(each)
		}
	})

	it('follows the reading direction', async () => {
		document.documentElement.dir = 'rtl'
		try {
			const fixture = mount(gallery(['a', 'b', 'c']))
			await openLightbox(boxes(fixture)[0]!)

			await userEvent.keyboard('{ArrowLeft}')

			await expect.poll(activeSlideLabel).toBe('2 of 3')
			const current = query(document, '.amk-lightbox-slide:not([inert]) .subject')
			expect(current.dataset.label).toBe('b')
			expect(query(document, '.amk-lightbox-track').scrollLeft).toBeLessThan(0)
			await close()
		} finally {
			document.documentElement.removeAttribute('dir')
		}
	})

	it('drags in the reading direction', async () => {
		document.documentElement.dir = 'rtl'
		try {
			const fixture = mount(gallery(['a', 'b', 'c']))
			await openLightbox(boxes(fixture)[0]!)

			await commands.mouseDown(380, 400)
			await commands.mouseUp(500, 400)

			await expect.poll(trackOffset).toBe(1280)
			expect(activeSlideLabel()).toBe('2 of 3')
			await close()
		} finally {
			document.documentElement.removeAttribute('dir')
		}
	})

	it('hides navigation for a single item', async () => {
		await openLightbox(boxes(mount(item(block('a'))))[0]!)

		for (const selector of ['.amk-lightbox-previous', '.amk-lightbox-next']) {
			expect(getComputedStyle(query(document, selector)).visibility).toBe('hidden')
		}
	})

	it('puts everything back when the dialog is closed directly', async () => {
		const fixture = mount(gallery(['a', 'b']))
		const items = boxes(fixture)
		await openLightbox(items[0]!)

		viewer().close()

		await expect.poll(() => subjectOf(items[1]!)?.parentElement).toBe(items[1])
		expect(subjectOf(items[0]!)?.parentElement).toBe(items[0])
		expect(isLifted(items[0]!)).toBe(false)
	})
})

/** Ask the viewer to close and wait until it has. */
async function close(): Promise<void> {
	const dialog = viewer()
	dialog.requestClose()
	await expect.poll(() => dialog.open).toBe(false)
}
