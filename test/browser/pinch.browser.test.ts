import { afterEach, expect, it } from 'vitest'
import { commands, page, userEvent } from 'vitest/browser'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	boxes,
	cleanUp,
	currentLayer,
	currentStage,
	frames,
	middleOf,
	mount,
	query,
	setUpLightbox,
	transitionsDone,
	viewer,
	zoomable,
} from './helpers'

setUpLightbox()
afterEach(async () => {
	await commands.touchContacts([])
	await cleanUp()
	await page.viewport(1280, 800)
})

async function open(level = 'fit') {
	const fixture = mount(zoomable(level) + zoomable(level, 'aurora', 1600))
	const image = query(fixture, 'img', HTMLImageElement)
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true)
	await openLightbox(boxes(fixture)[0]!)
	return fixture
}

function pointer(type: string, id: number, x: number, y: number, target: Element = currentLayer()) {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			button: 0,
			buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
			cancelable: true,
			clientX: x,
			clientY: y,
			isPrimary: id === 1,
			pointerId: id,
			pointerType: 'touch',
		}),
	)
}

async function pinch(scale: number) {
	const { x, y } = middleOf(currentStage())
	pointer('pointerdown', 1, x - 50, y)
	pointer('pointerdown', 2, x + 50, y)
	pointer('pointermove', 1, x - 50 * scale, y)
	pointer('pointermove', 2, x + 50 * scale, y)
	await frames()
	return { x, y }
}

function lift() {
	pointer('pointerup', 1, 0, 0)
	pointer('pointerup', 2, 0, 0)
}

it.each(['fit', 'fill', 'native'])(
	'pinches an image with the %s preset and exposes a reset control',
	async (level) => {
		await open(level)
		const { width } = currentLayer().getBoundingClientRect()
		const controls = query(viewer(), '.amk-lightbox-close').getBoundingClientRect()
		await pinch(2)
		lift()
		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width * 2, 0)
		expect(window.visualViewport!.scale).toBe(1)
		expect(query(viewer(), '.amk-lightbox-close').getBoundingClientRect().toJSON()).toEqual(
			controls.toJSON(),
		)
		const zoom = query(viewer(), '.amk-lightbox-zoom', HTMLButtonElement)
		expect(zoom.hidden).toBe(false)
		expect(zoom.ariaPressed).toBe('true')
		await userEvent.click(zoom)
		await transitionsDone()
		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width, 0)
		expect(viewer().open).toBe(true)
		expect(document.activeElement).toBe(zoom)
		expect(zoom.hidden).toBe(false)
	},
)

it('keeps the pinched image point under the moving midpoint', async () => {
	await open()
	const box = currentLayer().getBoundingClientRect()
	const x = box.x + box.width * 0.4
	const y = box.y + box.height * 0.4
	pointer('pointerdown', 1, x - 50, y)
	pointer('pointerdown', 2, x + 50, y)
	pointer('pointermove', 1, x - 100 - 20, y - 30)
	pointer('pointermove', 2, x + 100 - 20, y - 30)
	await frames()
	const zoomed = currentLayer().getBoundingClientRect()
	expect(zoomed.x + zoomed.width * 0.4).toBeCloseTo(x - 20, 0)
	expect(zoomed.y + zoomed.height * 0.4).toBeCloseTo(y - 30, 0)
	lift()
})

it('continues panning with the remaining finger without navigating or dismissing', async () => {
	await open()
	const { x, y } = await pinch(3)
	pointer('pointerup', 1, x - 150, y)
	const before = currentLayer().getBoundingClientRect()
	pointer('pointermove', 2, x + 150 - 80, y - 60)
	await frames()
	const after = currentLayer().getBoundingClientRect()
	expect(after.x).toBeCloseTo(before.x - 80, 0)
	expect(after.y).toBeCloseTo(before.y - 60, 0)
	expect(after.width).toBeCloseTo(before.width, 0)
	lift()
	expect(activeSlideLabel()).toBe('1 of 2')
	expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)
})

it('returns to fit and suppresses the release click before allowing navigation', async () => {
	await open()
	const { width } = currentLayer().getBoundingClientRect()
	await pinch(2)
	lift()
	await pinch(0.4)
	lift()
	const { x, y } = middleOf(currentStage())
	pointer('click', 1, x, y)
	await transitionsDone()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width, 0)
	expect(viewer().querySelector('[data-zoomed]')).toBeNull()
	expect(viewer().open).toBe(true)
	await userEvent.click(query(viewer(), '.amk-lightbox-next'))
	await expect.poll(activeSlideLabel).toBe('2 of 2')
})

it('ignores a third contact and rebases the surviving pair without jumping', async () => {
	await open()
	const { x, y } = await pinch(2)
	const { width } = currentLayer().getBoundingClientRect()
	pointer('pointerdown', 3, 40, 40, query(viewer(), '.amk-lightbox-close'))
	pointer('pointermove', 1, x - 200, y)
	pointer('pointermove', 2, x + 200, y)
	await frames()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width, 0)
	pointer('pointerup', 3, 40, 40)
	pointer('pointermove', 1, x - 220, y)
	pointer('pointermove', 2, x + 220, y)
	await frames()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width * 1.1, 0)
	lift()
	expect(viewer().open).toBe(true)
})

it('forgets cancelled contacts and accepts a fresh pinch', async () => {
	await open()
	const { x, y } = await pinch(2)
	const { width } = currentLayer().getBoundingClientRect()
	pointer('pointercancel', 1, x - 100, y)
	pointer('pointermove', 2, x + 250, y)
	pointer('pointerup', 2, x + 250, y)
	await frames()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width, 0)
	await pinch(1.5)
	lift()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width * 1.5, 0)
})

it.each(['held', 'released'])(
	'preserves pinch size and focal point through resize with fingers %s',
	async (state) => {
		await open('fill')
		await pinch(2)
		if (state === 'released') {
			lift()
		}

		const before = currentLayer().getBoundingClientRect()
		const center = middleOf(currentStage())
		await page.viewport(900, 600)
		await frames(4)
		const after = currentLayer().getBoundingClientRect()
		const resizedCenter = middleOf(currentStage())
		expect(after.width).toBeCloseTo(before.width, 0)
		expect((resizedCenter.x - after.x) / after.width).toBeCloseTo(
			(center.x - before.x) / before.width,
			2,
		)
		expect((resizedCenter.y - after.y) / after.height).toBeCloseTo(
			(center.y - before.y) / before.height,
			2,
		)
		expect(viewer().querySelector('[data-zoomed]')).not.toBeNull()
		pointer('pointermove', 1, 0, 0)
		pointer('pointermove', 2, 900, 600)
		await frames()
		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(before.width, 0)
		lift()
	},
)

it('stops a held pinch when the reset control is activated', async () => {
	await open()
	const { width } = currentLayer().getBoundingClientRect()
	const { x, y } = await pinch(2)
	query(viewer(), '.amk-lightbox-zoom', HTMLButtonElement).click()
	await transitionsDone()
	pointer('pointermove', 1, x - 200, y)
	pointer('pointermove', 2, x + 200, y)
	await frames()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width, 0)
	lift()
	await pinch(2)
	lift()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width * 2, 0)
})

it('restores the caption and fitted image geometry after pinching out', async () => {
	const fixture = mount(`<figure>${zoomable('fit')}<figcaption>Image details</figcaption></figure>`)
	const image = query(fixture, 'img', HTMLImageElement)
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true)
	await openLightbox(boxes(fixture)[0]!)
	const caption = query(viewer(), '.amk-lightbox-caption')
	const before = currentLayer().getBoundingClientRect()
	await pinch(2)
	lift()
	expect(caption.inert).toBe(true)
	await pinch(0.4)
	lift()
	await transitionsDone()
	expect(caption.inert).toBe(false)
	expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(before.toJSON())
})

it('bounds extreme zoom and pan without moving to another slide', async () => {
	await open()
	const { width } = currentLayer().getBoundingClientRect()
	const { x, y } = await pinch(12)
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width * 8, 0)
	pointer('pointerup', 1, x - 600, y)
	pointer('pointermove', 2, -10_000, -10_000)
	await frames()
	const stage = currentStage()
	expect(stage.scrollLeft).toBeCloseTo(stage.scrollWidth - stage.clientWidth, 0)
	expect(stage.scrollTop).toBeCloseTo(stage.scrollHeight - stage.clientHeight, 0)
	pointer('pointermove', 2, 10_000, 10_000)
	await frames()
	expect(stage.scrollLeft).toBe(0)
	expect(stage.scrollTop).toBe(0)
	lift()
	expect(activeSlideLabel()).toBe('1 of 2')
	expect(viewer().open).toBe(true)
})

it('hands an existing swipe to a pinch without changing slides', async ({ skip }) => {
	await open()
	const { x, y } = middleOf(currentStage())
	const { width } = currentLayer().getBoundingClientRect()
	const first = { id: 1, x, y }
	if (!(await commands.touchContacts([first]))) {
		skip()
		return
	}

	first.x -= 80
	await commands.touchContacts([first])
	await frames()
	expect(query(viewer(), '.amk-lightbox-track').scrollLeft).toBeGreaterThan(30)
	const second = { id: 2, x: x + 80, y }
	await commands.touchContacts([first, second])
	first.x -= 80
	second.x += 80
	await commands.touchContacts([first, second])
	await frames()
	await commands.touchContacts([])
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width * 2, 0)
	expect(query(viewer(), '.amk-lightbox-track').scrollLeft).toBe(0)
	expect(activeSlideLabel()).toBe('1 of 2')
})

it.for(['fit', 'fill', 'native'])(
	'pinches, pans, returns to fit and swipes with native touch input for %s',
	async (level, { skip }) => {
		await open(level)
		const { width } = currentLayer().getBoundingClientRect()
		const { x, y } = middleOf(currentStage())
		const first = { id: 1, x: x - 60, y }
		const second = { id: 2, x: x + 60, y }
		if (!(await commands.touchContacts([first, second]))) {
			skip()
			return
		}

		for (let i = 1; i <= 8; i++) {
			first.x = x - 60 - i * 15
			second.x = x + 60 + i * 15
			await commands.touchContacts([first, second])
			await frames()
		}

		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width * 3, 0)
		await commands.touchContacts([second])
		const before = currentLayer().getBoundingClientRect()
		second.x -= 100
		second.y -= 80
		await commands.touchContacts([second])
		await frames()
		expect(currentLayer().getBoundingClientRect().x).toBeCloseTo(before.x - 100, 0)
		expect(currentLayer().getBoundingClientRect().y).toBeCloseTo(before.y - 80, 0)
		await commands.touchContacts([])

		// A new, mostly vertical drag also pans instead of dismissing the image.
		const panned = currentLayer().getBoundingClientRect()
		first.x = x
		first.y = y
		await commands.touchContacts([first])
		first.x -= 10
		first.y -= 80
		await commands.touchContacts([first])
		await frames()
		expect(currentLayer().getBoundingClientRect().x).toBeCloseTo(panned.x - 10, 0)
		expect(currentLayer().getBoundingClientRect().y).toBeCloseTo(panned.y - 80, 0)
		await commands.touchContacts([])
		expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)

		first.x = x - 150
		first.y = y
		second.x = x + 150
		second.y = y
		await commands.touchContacts([first, second])
		for (let i = 1; i <= 8; i++) {
			first.x = x - 150 + i * 15
			second.x = x + 150 - i * 15
			await commands.touchContacts([first, second])
			await frames()
		}

		await commands.touchContacts([])
		await transitionsDone()
		expect(viewer().querySelector('[data-zoomed]')).toBeNull()
		expect(viewer().open).toBe(true)
		await commands.touchSwipe()
		await expect.poll(activeSlideLabel).toBe('2 of 2')
	},
)
