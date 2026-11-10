// Icons a site configures through the integration, in the fixture built with
// them: drawn into the page by the templates, and into the viewer by its script.

import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { disposeCarousels, setUpCarousels } from '../../src/components/internal/carousel/carousel'
import { waitForFrame } from './frame'
import { cleanUp, mountPage, query } from './helpers'

afterEach(async () => {
	disposeCarousels()
	await cleanUp()
})

it('shows the configured icons in the page before any player script runs', async () => {
	const fixture = await mountPage('/themed/')
	expect(customElements.get('video-player')).toBeUndefined()
	for (const player of ['#video', '#audio']) {
		const play = query(fixture, `${player} media-play-button [data-amk-icon="play"]`)
		expect(query(play, 'svg', SVGElement).dataset.customIcon).toBe('play')
		expect(play.getBoundingClientRect().width).toBeGreaterThan(0)
	}

	// A button that isn't running yet shows what it will at rest
	const button = query(fixture, '#video .amk-bar media-play-button')
	expect(getComputedStyle(query(button, '.amk-icon-play')).display).toBe('block')
	expect(getComputedStyle(query(button, '.amk-icon-pause')).display).toBe('none')
	expect(getComputedStyle(query(button, '.amk-icon-restart')).display).toBe('none')
	expect(query(fixture, '#indicator .amk-zoom-indicator svg', SVGElement).dataset.customIcon).toBe(
		'expand',
	)
	expect(
		query(fixture, '#local-indicator .amk-zoom-indicator svg', SVGElement).dataset.customIcon,
	).toBe('local-indicator')
})

it('sizes and colors configured and built-in carousel icons alike, and mirrors them', async () => {
	const fixture = await mountPage('/themed/')
	setUpCarousels()
	const carousel = query(fixture, '.amk-carousel')
	const previous = query(carousel, '.amk-carousel-previous')
	const next = query(carousel, '.amk-carousel-next')
	expect(query(next, 'svg', SVGElement).dataset.customIcon).toBe('next')
	expect(query(previous, 'svg', SVGElement).dataset.customIcon).toBeUndefined()
	expect(getComputedStyle(next).width).toBe('48px')
	expect(getComputedStyle(next).borderRadius).toBe('8px')
	for (const button of [previous, next]) {
		const svg = query(button, 'svg', SVGElement)
		expect(getComputedStyle(svg).width).toBe('28px')
		expect(getComputedStyle(svg).color).toBe('rgb(250, 220, 100)')
	}

	// The built-in artwork is drawn in strokes of the button's color
	expect(getComputedStyle(query(previous, 'svg', SVGElement)).stroke).toBe('rgb(250, 220, 100)')
	expect(getComputedStyle(query(previous, 'svg', SVGElement)).fill).toBe('none')
	await userEvent.click(next)
	await expect.poll(() => next.getAttribute('aria-disabled')).toBe('true')
	carousel.dir = 'rtl'
	expect(getComputedStyle(query(next, '.amk-carousel-icon')).scale).toBe('-1 1')
})

it("draws the configured icons on the viewer's own buttons, which switch with their state", async () => {
	const frame = document.createElement('iframe')
	frame.src = '/themed/index.html'
	frame.style.cssText = 'width: 1000px; height: 700px; border: 0'
	document.body.append(frame)
	try {
		await waitForFrame(frame, 'themed')
		const root = frame.contentDocument!
		const view = frame.contentWindow!
		root.querySelector<HTMLElement>(':scope #indicator .amk-zoom')!.click()
		await expect
			.poll(
				() => root.querySelector<HTMLDialogElement>(':scope dialog.amk-lightbox')?.dataset.state,
			)
			.toBe('open')
		const dialog = root.querySelector<HTMLDialogElement>(':scope dialog.amk-lightbox')!
		const close = dialog.querySelector<HTMLElement>('.amk-lightbox-close')!
		const closeIcon = close.querySelector<SVGElement>('svg')!
		expect(close.getAttribute('aria-label')).toBe('Close')
		expect(closeIcon.dataset.customIcon).toBe('close')
		expect(view.getComputedStyle(close).width).toBe('52px')
		expect(view.getComputedStyle(close).borderRadius).toBe('8px')
		expect(view.getComputedStyle(closeIcon).width).toBe('28px')
		expect(view.getComputedStyle(closeIcon).color).toBe('rgb(250, 220, 100)')
		expect(
			dialog.querySelector<SVGElement>(':scope .amk-lightbox-next svg')!.dataset.customIcon,
		).toBe('next')
		// The built-in artwork, in strokes of the button's color
		const previousIcon = dialog.querySelector<SVGElement>(':scope .amk-lightbox-previous svg')!
		expect(previousIcon.dataset.customIcon).toBeUndefined()
		expect(view.getComputedStyle(previousIcon).stroke).toBe('rgb(250, 220, 100)')

		const zoom = dialog.querySelector<HTMLElement>('.amk-lightbox-zoom')!
		const zoomIn = zoom.querySelector<HTMLElement>('[data-amk-icon="zoom-in"]')!
		const zoomOut = zoom.querySelector<HTMLElement>('[data-amk-icon="zoom-out"]')!
		await expect.poll(() => zoom.hidden).toBe(false)
		// The button answers once the opening transition has run
		await expect
			.poll(
				() =>
					dialog
						.getAnimations({ subtree: true })
						.filter((animation) => animation.playState === 'running').length,
			)
			.toBe(0)
		await new Promise((resolve) => {
			view.requestAnimationFrame(resolve)
		})
		expect(view.getComputedStyle(zoomIn).display).toBe('block')
		expect(view.getComputedStyle(zoomOut).display).toBe('none')
		zoom.click()
		await expect.poll(() => zoom.getAttribute('aria-pressed')).toBe('true')
		expect(view.getComputedStyle(zoomIn).display).toBe('none')
		expect(view.getComputedStyle(zoomOut).display).toBe('block')
	} finally {
		frame.remove()
	}
})
