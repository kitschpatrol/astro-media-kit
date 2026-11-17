import { afterEach, expect, it, vi } from 'vitest'
import { commands } from 'vitest/browser'
import { disposeCarousels, setUpCarousels } from '../../src/components/internal/carousel/carousel'
import { cleanUp, mountPage, query } from './helpers'
import '../../src/components/internal/carousel/carousel.css'

afterEach(async () => {
	disposeCarousels()
	vi.restoreAllMocks()
	await cleanUp()
})

it('honors existing page zoom, restores wheel navigation, and releases viewport listeners on disposal', async () => {
	const viewport = window.visualViewport!
	const width = vi
		.spyOn(viewport, 'width', 'get')
		.mockReturnValue(document.documentElement.clientWidth / 2)
	const fixture = await mountPage('/carousel/')
	setUpCarousels()
	const track = query(fixture, '#captioned .amk-carousel-track')
	expect(Object.hasOwn(track.dataset, 'pageZoomed')).toBe(true)
	expect(getComputedStyle(track).overflowX).toBe('hidden')
	const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 50 })
	track.dispatchEvent(wheel)
	expect(wheel.defaultPrevented).toBe(false)
	width.mockReturnValue(document.documentElement.clientWidth)
	viewport.dispatchEvent(new Event('resize'))
	expect(Object.hasOwn(track.dataset, 'pageZoomed')).toBe(false)
	expect(getComputedStyle(track).overflowX).toBe('auto')
	const nextWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 50 })
	track.dispatchEvent(nextWheel)
	expect(nextWheel.defaultPrevented).toBe(true)
	disposeCarousels()
	width.mockReturnValue(document.documentElement.clientWidth / 2)
	viewport.dispatchEvent(new Event('resize'))
	expect(Object.hasOwn(track.dataset, 'pageZoomed')).toBe(false)
})

it('pans the zoomed page over an inline carousel and restores swiping after zooming out', async ({
	skip,
}) => {
	const states = await commands.mobileGallery([
		{ type: 'inline' },
		{ scale: 2, type: 'pinch' },
		{ dx: -120, dy: 0, type: 'drag', x: 205, y: 295 },
		// Finish with an actual pinch: changing the emulated page scale leaves
		// Chromium's native touch sequence out of sync with its viewport.
		{ scale: 0.5, type: 'pinch' },
		{ dx: -520, dy: 0, type: 'drag', x: 600, y: 500 },
	])
	if (states === false) {
		skip()
		return
	}

	expect(states[1]!.viewport.scale).toBeGreaterThan(1.5)
	expect(states[2]!.viewport.x).toBeGreaterThan(states[1]!.viewport.x + 40)
	expect(states[2]!.inlineOffset).toBeCloseTo(0, 0)
	expect(states[3]!.viewport.scale).toBeCloseTo(1, 2)
	expect(states[4]!.inlineOffset).toBeGreaterThan(700)
}, 20_000)
