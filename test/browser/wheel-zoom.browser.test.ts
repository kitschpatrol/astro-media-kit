import { afterEach, expect, it } from 'vitest'
import {
	cleanUp,
	currentLayer,
	currentStage,
	frames,
	isHidden,
	middleOf,
	openZoomable,
	query,
	setUpLightbox,
	transitionsDone,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

/**
 * Turn the wheel over the current subject, with Ctrl held unless other keys are
 * given, as a trackpad pinch arrives in most browsers.
 */
function wheel(
	deltaY: number,
	{ x, y }: { x: number; y: number },
	keys?: { ctrlKey?: boolean; deltaMode?: number; metaKey?: boolean },
): WheelEvent {
	const event = new WheelEvent('wheel', {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
		composed: true,
		deltaY,
		...(keys ?? { ctrlKey: true }),
	})
	currentLayer().dispatchEvent(event)
	return event
}

/** One of Safari's trackpad pinch events over the current subject. */
function gesture(type: string, scale: number, { x, y }: { x: number; y: number }): Event {
	const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
		clientX: x,
		clientY: y,
		scale,
	})
	currentLayer().dispatchEvent(event)
	return event
}

/** The current slide's frame, whose layout width is the size last committed. */
function frame(): HTMLElement {
	return query(viewer(), '.amk-lightbox-slide:not([inert]) .amk-lightbox-frame')
}

it.each(['ctrlKey', 'metaKey'] as const)(
	'zooms about the pointer for a wheel turned with %s held, and lays out once it rests',
	async (key) => {
		await openZoomable()
		const fitted = currentLayer().getBoundingClientRect()
		const point = { x: fitted.x + fitted.width * 0.4, y: fitted.y + fitted.height * 0.7 }
		// Eight steps of a pinch, each a tenth larger
		for (let i = 0; i < 8; i++) {
			expect(wheel(-10, point, { [key]: true }).defaultPrevented).toBe(true)
		}

		await frames()
		const larger = currentLayer().getBoundingClientRect()
		expect(larger.width).toBeCloseTo(fitted.width * Math.exp(0.8), 0)
		// Once the image is larger than the viewer, where it no longer stays
		// centered, the point under the pointer stays under it
		const under = {
			x: (point.x - larger.x) / larger.width,
			y: (point.y - larger.y) / larger.height,
		}
		for (let i = 0; i < 4; i++) {
			wheel(-10, point, { [key]: true })
		}

		await frames()
		const held = currentLayer().getBoundingClientRect()
		expect(held.width).toBeCloseTo(fitted.width * Math.exp(1.2), 0)
		expect((point.x - held.x) / held.width).toBeCloseTo(under.x, 3)
		expect((point.y - held.y) / held.height).toBeCloseTo(under.y, 3)
		// Scaled while the run goes on, then laid out at the size it reached
		expect(frame().offsetWidth).toBeCloseTo(fitted.width, 0)
		await expect.poll(() => frame().offsetWidth).toBeCloseTo(held.width, 0)
		expect(getComputedStyle(frame()).scale).toBe('none')
		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(held.width, 0)
		expect(isHidden(query(viewer(), '.amk-lightbox-zoom'))).toBe(false)
		expect(viewer().open).toBe(true)
	},
)

it('leaves a plain wheel to pan and to turn slides', async () => {
	await openZoomable()
	const fitted = currentLayer().getBoundingClientRect()
	const event = wheel(-10, middleOf(currentStage()), {})
	await frames()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(fitted.width, 0)
	expect(viewer().querySelector('[data-zoomed]')).toBeNull()
	// Contained, as before, rather than zooming the page
	expect(event.defaultPrevented).toBe(true)
})

it.each([
	{ deltaMode: WheelEvent.DOM_DELTA_PIXEL, deltaY: -120 },
	{ deltaMode: WheelEvent.DOM_DELTA_LINE, deltaY: -3 },
])('zooms a modest step for a notch of a mouse wheel in delta mode $deltaMode', async (notch) => {
	await openZoomable()
	const fitted = currentLayer().getBoundingClientRect()
	wheel(notch.deltaY, middleOf(currentStage()), { ctrlKey: true, deltaMode: notch.deltaMode })
	await frames()
	const { width } = currentLayer().getBoundingClientRect()
	expect(width).toBeGreaterThan(fitted.width * 1.2)
	expect(width).toBeLessThan(fitted.width * 1.3)
})

it('stops at the zoom limit, and at fit without closing', async () => {
	await openZoomable()
	const fitted = currentLayer().getBoundingClientRect()
	const point = middleOf(currentStage())
	for (let i = 0; i < 20; i++) {
		wheel(-25, point)
	}

	await frames()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(fitted.width * 8, 0)

	for (let i = 0; i < 30; i++) {
		wheel(25, point)
	}

	await frames()
	// No smaller than fitted, and no dimming on the way to closing
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(fitted.width, 0)
	expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)
	await transitionsDone()
	await expect.poll(() => viewer().querySelector('[data-zoomed]')).toBeNull()
	expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(fitted.toJSON())
	expect(viewer().open).toBe(true)
})

it('keeps the image within its pan limits as it zooms out off-center', async () => {
	await openZoomable()
	const fitted = currentLayer().getBoundingClientRect()
	const stage = currentStage().getBoundingClientRect()
	const corner = { x: fitted.x + 10, y: fitted.y + 10 }
	for (let i = 0; i < 8; i++) {
		wheel(-25, corner)
	}

	// Out again about the far corner, which would pull the near edge inward
	const far = { x: stage.right - 20, y: stage.bottom - 20 }
	for (let i = 0; i < 3; i++) {
		wheel(25, far)
	}

	await frames()
	const held = currentLayer().getBoundingClientRect()
	expect(held.x).toBeLessThanOrEqual(stage.x + 32.5)
	expect(held.y).toBeLessThanOrEqual(stage.y + 32.5)
	expect(held.right).toBeGreaterThanOrEqual(stage.right - 32.5)
	expect(held.bottom).toBeGreaterThanOrEqual(stage.bottom - 32.5)
})

it("follows Safari's trackpad pinch events by the scale they report", async () => {
	await openZoomable()
	const fitted = currentLayer().getBoundingClientRect()
	const point = middleOf(currentStage())
	expect(gesture('gesturestart', 1, point).defaultPrevented).toBe(true)
	gesture('gesturechange', 1.5, point)
	gesture('gesturechange', 2, point)
	await frames()
	const held = currentLayer().getBoundingClientRect()
	expect(held.width).toBeCloseTo(fitted.width * 2, 0)
	expect(held.x + held.width / 2).toBeCloseTo(point.x, 0)
	expect(frame().offsetWidth).toBeCloseTo(fitted.width, 0)
	// Its end lays the image out at once, without waiting out a rest
	gesture('gestureend', 2, point)
	expect(frame().offsetWidth).toBeCloseTo(fitted.width * 2, 0)
	expect(viewer().open).toBe(true)
})
