import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	block,
	boxes,
	cleanUp,
	clickSubject,
	close,
	currentLayer,
	currentStage,
	gallery,
	item,
	mount,
	query,
	setUpLightbox,
	transitionsDone,
	viewer,
	zoomable,
} from './helpers'

const largestCandidatePattern = /-2400\.jpg$/v

setUpLightbox()
afterEach(cleanUp)

describe('zoom', () => {
	it('reverses zoom on consecutive clicks even before the transition finishes', async () => {
		const fixture = mount(zoomable('native'))
		await openLightbox(boxes(fixture)[0]!)
		const layer = currentLayer()
		const fit = layer.getBoundingClientRect()
		const point = { clientX: fit.x + fit.width / 2, clientY: fit.y + fit.height / 2 }
		for (const detail of [1, 2, 3, 4]) {
			layer.dispatchEvent(new MouseEvent('click', { ...point, bubbles: true, detail }))
			expect(viewer().querySelector('[data-zoomed]') !== null).toBe(detail % 2 === 1)
			expect(query(document, '.amk-lightbox-zoom').getAttribute('aria-disabled')).toBe('false')
		}

		await transitionsDone()
		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(fit.width, 0)
		expect(viewer().open).toBe(true)
	})

	it('allows a rapid second click to dismiss after the brief opening guard expires', async () => {
		const fixture = mount(zoomable('fit'))
		const clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
		try {
			const opening = openLightbox(boxes(fixture)[0]!)
			const layer = currentLayer()
			clock.mockReturnValue(1100)
			layer.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }))
			expect(viewer().dataset.state).toBe('open')
			clock.mockReturnValue(1151)
			layer.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 3 }))
			expect(viewer().dataset.state).toBe('closing')
			await opening
			await expect.poll(() => viewer().open).toBe(false)
		} finally {
			clock.mockRestore()
		}
	})

	it('zooms to cover the viewer on a click, and back to fitting on the next one', async () => {
		const fixture = mount(zoomable('fill'))
		await openLightbox(boxes(fixture)[0]!)
		const fit = currentLayer().getBoundingClientRect()

		await clickSubject(0.5, 0.5)
		await transitionsDone()

		const zoomed = currentLayer().getBoundingClientRect()
		expect(zoomed.width).toBeCloseTo(window.innerWidth, 0)
		expect(zoomed.height).toBeGreaterThan(window.innerHeight)
		expect(currentStage().scrollHeight).toBeGreaterThan(currentStage().clientHeight)
		expect(viewer().open).toBe(true)

		await userEvent.click(currentStage(), { position: { x: 200, y: 200 } })
		await transitionsDone()

		const back = currentLayer().getBoundingClientRect()
		expect(back.width).toBeCloseTo(fit.width, 0)
		expect(back.x).toBeCloseTo(fit.x, 0)
		expect(back.y).toBeCloseTo(fit.y, 0)
	})

	it('keeps the clicked point of the image under the pointer', async () => {
		const fixture = mount(zoomable('native'))
		await openLightbox(boxes(fixture)[0]!)
		const fit = currentLayer().getBoundingClientRect()

		const point = await clickSubject(0.3, 0.4)
		await transitionsDone()

		const zoomed = currentLayer().getBoundingClientRect()
		const u = { x: (point.x - fit.x) / fit.width, y: (point.y - fit.y) / fit.height }
		expect(zoomed.x + u.x * zoomed.width).toBeCloseTo(point.x, -0.5)
		expect(zoomed.y + u.y * zoomed.height).toBeCloseTo(point.y, -0.5)
	})

	it('lays a native image out at the width the item declares, which then loads', async () => {
		const fixture = mount(zoomable('native'))
		const image = query(fixture, 'img', HTMLImageElement)
		await openLightbox(boxes(fixture)[0]!)

		await clickSubject(0.5, 0.5)
		await transitionsDone()

		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(2400, 0)
		await expect.poll(() => image.currentSrc).toMatch(largestCandidatePattern)
	})

	it('measures a native width the item does not declare, ignoring rejected picture sources', async () => {
		const fixture = mount(
			item(
				`<picture><source type="image/not-supported" srcset="/media/tile-2400.jpg 9000w">
					<img src="/media/tile-2400.jpg" width="2400" height="2400" alt="Tile" style="width: 100%; height: auto" />
				</picture>`,
				'data-level="native" style="width: 200px"',
			),
		)
		await query(fixture, 'img', HTMLImageElement).decode()
		await openLightbox(boxes(fixture)[0]!)
		query(document, '.amk-lightbox-zoom').click()
		expect(query(document, '.amk-lightbox-frame').getBoundingClientRect().width).toBe(2400)
	})

	it('closes on a click when the level is fit, or when zooming would hardly enlarge it', async () => {
		const fixture = mount(`
			${zoomable('fit')}
			${item(
				'<img src="/media/tile-480.jpg" alt="" width="480" height="480" style="width: 100%; height: auto" />',
				'data-level="native" data-native-width="480" style="width: 240px"',
			)}`)
		const [fit, small] = boxes(fixture)

		await openLightbox(fit!)
		await clickSubject(0.5, 0.5)
		await expect.poll(() => viewer().open).toBe(false)

		await openLightbox(small!)
		await clickSubject(0.5, 0.5)
		await expect.poll(() => viewer().open).toBe(false)
	})

	it('pans with a mouse drag, without zooming out or navigating', async () => {
		const fixture = mount(zoomable('native') + zoomable('native', 'aurora', 1600))
		await openLightbox(boxes(fixture)[0]!)
		await clickSubject(0.5, 0.5)
		await transitionsDone()
		const { scrollLeft, scrollTop } = currentStage()

		const target = page.elementLocator(currentStage())
		await userEvent.dragAndDrop(target, target, {
			sourcePosition: { x: 700, y: 500 },
			targetPosition: { x: 500, y: 350 },
		})
		await transitionsDone()

		expect(currentStage().scrollLeft).toBeCloseTo(scrollLeft + 200, -1)
		expect(currentStage().scrollTop).toBeCloseTo(scrollTop + 150, -1)
		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(2400, 0)
		expect(activeSlideLabel()).toBe('1 of 2')
	})

	it('pans a lone zoomed item with the arrow keys', async () => {
		const fixture = mount(zoomable('native'))
		await openLightbox(boxes(fixture)[0]!)
		await clickSubject(0.5, 0.5)
		await transitionsDone()
		const { scrollLeft, scrollTop } = currentStage()

		await userEvent.keyboard('{ArrowRight}{ArrowDown}')

		await expect.poll(() => currentStage().scrollLeft).toBeGreaterThan(scrollLeft)
		await expect.poll(() => currentStage().scrollTop).toBeGreaterThan(scrollTop)
		expect(viewer().open).toBe(true)
	})

	it('zooms back out once a slide that was navigated away from is out of view', async () => {
		const fixture = mount(zoomable('fill') + zoomable('fill', 'aurora', 1600))
		await openLightbox(boxes(fixture)[0]!)
		const fit = currentLayer().getBoundingClientRect()
		await clickSubject(0.5, 0.5)
		await transitionsDone()

		// The arrow keys pan while zoomed, so navigate with the buttons
		await userEvent.click(query(document, '.amk-lightbox-next'))
		await expect.poll(activeSlideLabel).toBe('2 of 2')
		const first = query(document, '.amk-lightbox-slide .amk-lightbox-layer')
		await expect.poll(() => first.getBoundingClientRect().width).toBeCloseTo(fit.width, 0)

		await userEvent.click(query(document, '.amk-lightbox-previous'))
		await expect.poll(activeSlideLabel).toBe('1 of 2')
		await expect.poll(() => currentLayer().getBoundingClientRect().x).toBeCloseTo(fit.x, 0)
		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(fit.width, 0)
	})

	it('zooms from the keyboard with the Zoom button, whose arrow keys then pan', async () => {
		const fixture = mount(zoomable('fill') + zoomable('fill', 'aurora', 1600))
		await openLightbox(boxes(fixture)[0]!)
		const button = query(document, '.amk-lightbox-zoom', HTMLButtonElement)
		expect(button.hidden).toBe(false)
		expect(button.ariaPressed).toBe('false')

		button.focus()
		await userEvent.keyboard('{Enter}')
		await expect.poll(() => button.ariaPressed).toBe('true')
		await transitionsDone()
		expect(document.activeElement).toBe(button)
		const { scrollTop } = currentStage()
		await userEvent.keyboard('{ArrowDown}')

		await expect.poll(() => currentStage().scrollTop).toBeGreaterThan(scrollTop)
		expect(activeSlideLabel()).toBe('1 of 2')
		await userEvent.keyboard('{Enter}')
		await expect.poll(() => button.ariaPressed).toBe('false')
	})

	it('shows the Zoom button only in galleries that zoom, disabled on items that can’t', async () => {
		await openLightbox(boxes(mount(gallery(['a', 'b'])))[0]!)
		expect(query(document, '.amk-lightbox-zoom').hidden).toBe(true)
		await close()

		const fixture = mount(`${zoomable('fill')}${item(block('plain'), 'data-gallery="z"')}`)
		await openLightbox(boxes(fixture)[0]!)
		const button = query(document, '.amk-lightbox-zoom', HTMLButtonElement)
		expect(button.hidden).toBe(false)
		expect(button.ariaDisabled).toBe('false')

		await userEvent.click(query(document, '.amk-lightbox-next'))
		await expect.poll(activeSlideLabel).toBe('2 of 2')
		await expect.poll(() => button.ariaDisabled).toBe('true')
	})

	it('closes from a zoomed state onto the page', async () => {
		const fixture = mount(zoomable('native'))
		const image = query(fixture, 'img')
		const before = image.getBoundingClientRect()
		await openLightbox(boxes(fixture)[0]!)
		await clickSubject(0.2, 0.8)
		await transitionsDone()

		await userEvent.keyboard('{Escape}')
		await expect.poll(() => viewer().open).toBe(false)

		expect(image.parentElement?.tagName).toBe('DIV')
		const after = image.getBoundingClientRect()
		expect(after.x).toBeCloseTo(before.x, 1)
		expect(after.width).toBeCloseTo(before.width, 1)
	})
})
