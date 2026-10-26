// The kit's Video.js player, as the components render it, lifted whole into the
// viewer: its own control bar floats over the viewer, its zoom button closes
// the viewer again, and its poster stands in for it on the page.

import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import '../../src/components/internal/videojs-ui'
import '../../src/components/internal/videojs-media'
import '../../src/components/internal/amk-video.css'
import {
	boxes,
	cleanUp,
	currentLayer,
	isLifted,
	liftDone,
	mountPage,
	query,
	setUpLightbox,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

/** The fixture page's player, with its media source assigned as it is on load. */
async function mountPlayer(): Promise<{ item: HTMLElement; player: HTMLElement }> {
	const fixture = await mountPage('/zoom/')
	// The media script assigns `data-src` sources on load and after navigation
	document.dispatchEvent(new Event('astro:page-load'))
	const item = boxes(query(fixture, '#video'))[0]!
	const player = query(item, 'video-player')
	await customElements.whenDefined('video-player')
	await expect.poll(() => query(item, 'video').getAttribute('src')).toBe('/media/loop.mp4')
	return { item, player }
}

it('is not a button, and leaves clicks on its controls to the player', async () => {
	const { item, player } = await mountPlayer()
	expect(item.hasAttribute('role')).toBe(false)
	expect(item.hasAttribute('tabindex')).toBe(false)
	expect(item.dataset.interactive).toBe('')

	await userEvent.click(query(player, 'media-play-button'))

	expect(document.querySelector('dialog.amk-lightbox[open]')).toBeNull()
})

it('lifts the whole player from its zoom button, floats its controls, and closes from the same button', async () => {
	const { item, player } = await mountPlayer()
	const button = query(player, '[data-zoom-open]')
	const controls = query(player, '.amk-controls')
	const enter = query(button, '.amk-icon-zoom-enter')
	const exit = query(button, '.amk-icon-zoom-exit')
	expect(getComputedStyle(enter).display).not.toBe('none')
	expect(getComputedStyle(exit).display).toBe('none')

	await userEvent.click(button)

	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	expect(isLifted(item)).toBe(true)
	expect(currentLayer().contains(player)).toBe(true)
	expect(viewer().contains(controls)).toBe(true)
	expect(controls.getAttribute('popover')).toBe('manual')
	expect(controls.matches(':popover-open')).toBe(true)
	expect(getComputedStyle(enter).display).toBe('none')
	expect(getComputedStyle(exit).display).not.toBe('none')
	const frame = query(viewer(), '.amk-lightbox-frame').getBoundingClientRect()
	expect(frame.width / frame.height).toBeCloseTo(16 / 9, 1)

	await userEvent.click(button)

	await expect.poll(() => viewer().open).toBe(false)
	expect(item.contains(player)).toBe(true)
	expect(controls.hasAttribute('popover')).toBe(false)
	expect(isLifted(item)).toBe(false)
})

it('stands its poster in for the player while it is lifted', async () => {
	const { item } = await mountPlayer()
	await expect.poll(() => item.querySelector('media-poster[data-visible]')).not.toBeNull()
	const container = query(item, 'media-container').getBoundingClientRect()

	await userEvent.click(query(item, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')

	const preview = query(item, '[data-preview]', HTMLImageElement)
	expect(preview.src).toContain('/media/loop-poster.jpg')
	expect(preview.inert).toBe(true)
	const box = preview.getBoundingClientRect()
	expect(box.width).toBeCloseTo(container.width, 0)
	expect(box.height).toBeCloseTo(container.height, 0)
	expect(box.x).toBeCloseTo(container.x, 0)
})

it('keeps the floated controls visible while they are used, and hides them when idle', async () => {
	const { player } = await mountPlayer()
	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	const controls = query(player, '.amk-controls')
	expect(Object.hasOwn(controls.dataset, 'userInactive')).toBe(false)

	query(controls, 'media-play-button').focus()
	await new Promise((resolve) => {
		setTimeout(resolve, 2300)
	})
	expect(Object.hasOwn(controls.dataset, 'userInactive')).toBe(false)

	viewer().focus()
	await expect
		.poll(() => Object.hasOwn(controls.dataset, 'userInactive'), { timeout: 4000 })
		.toBe(true)
})

it('slides its control bar up as it lifts, and away again as it lands', async () => {
	const { player } = await mountPlayer()
	const controls = query(player, '.amk-controls')
	const button = query(player, '[data-zoom-open]')
	// Slow enough to look in on the bar while it moves
	const slow = document.createElement('style')
	slow.textContent = '.amk-lightbox { --amk-lightbox-duration: 1s }'
	document.head.append(slow)
	try {
		await userEvent.click(button)
		await expect.poll(() => controls.matches(':popover-open')).toBe(true)
		const entering = controls
			.getAnimations()
			.filter((animation) => animation instanceof CSSTransition)
			.map((animation) => animation.transitionProperty)
		expect(entering).toContain('translate')
		const rising = controls.getBoundingClientRect().top
		await liftDone(3000)
		await expect
			.poll(() => controls.getBoundingClientRect().bottom)
			.toBeCloseTo(window.innerHeight, 0)
		expect(rising).toBeGreaterThan(controls.getBoundingClientRect().top)

		viewer().requestClose()
		await expect.poll(() => controls.matches(':popover-open')).toBe(false)
		// Still a popover, on its way out, while the player zooms home
		expect(controls.hasAttribute('popover')).toBe(true)
		await expect.poll(() => viewer().open, { timeout: 3000 }).toBe(false)
		expect(controls.hasAttribute('popover')).toBe(false)
	} finally {
		slow.remove()
	}
})

it('only fades its bar in the page as the controls hide and show', async () => {
	const { player } = await mountPlayer()
	const controls = query(player, '.amk-controls')
	const bar = query(player, '.amk-bar')
	const container = query(player, 'media-container')
	await expect.poll(() => Object.hasOwn(controls.dataset, 'visible')).toBe(true)
	const resting = bar.getBoundingClientRect()
	expect(resting.bottom).toBeCloseTo(container.getBoundingClientRect().bottom, 0)

	delete controls.dataset.visible
	await expect.poll(() => getComputedStyle(controls).opacity).toBe('0')
	expect(bar.getBoundingClientRect().top).toBeCloseTo(resting.top, 0)
	expect(getComputedStyle(controls).transitionDuration).toBe('0.2s')

	controls.dataset.visible = ''
	await expect.poll(() => getComputedStyle(controls).opacity).toBe('1')
	expect(bar.getBoundingClientRect().top).toBeCloseTo(resting.top, 0)
})

it('raises its bar back into the player as the lightbox closes', async () => {
	const { player } = await mountPlayer()
	const controls = query(player, '.amk-controls')
	const bar = query(player, '.amk-bar')
	const container = query(player, 'media-container')
	await expect.poll(() => Object.hasOwn(controls.dataset, 'visible')).toBe(true)

	await userEvent.click(query(player, '[data-zoom-open]'))
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await liftDone()
	viewer().requestClose()
	await expect.poll(() => viewer().open).toBe(false)

	// Back in the player, on its way up from under the edge
	expect(controls.hasAttribute('popover')).toBe(false)
	const { bottom } = container.getBoundingClientRect()
	expect(bar.getBoundingClientRect().bottom).toBeGreaterThan(bottom + 1)
	await expect.poll(() => bar.getBoundingClientRect().bottom).toBeCloseTo(bottom, 0)
	expect(getComputedStyle(controls).opacity).toBe('1')
})
