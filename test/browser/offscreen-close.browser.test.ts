import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	boxes,
	cleanUp,
	currentLayer,
	imageItem,
	mount,
	query,
	setUpLightbox,
	transitionsDone,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

it.each(['above', 'below'] as const)(
	'closes toward a thumbnail %s the viewport without scrolling the page',
	async (direction) => {
		const fixture = mount(
			`${imageItem('data-gallery="offscreen"')}<div style="height: 200vh"></div>${imageItem('data-gallery="offscreen"')}<div style="height: 100vh"></div>`,
		)
		await Promise.all(Array.from(fixture.querySelectorAll('img'), async (image) => image.decode()))
		const items = boxes(fixture)
		const start = direction === 'above' ? 1 : 0
		const target = items[1 - start]!
		items[start]!.scrollIntoView({ behavior: 'instant', block: 'center' })
		const scroll = { x: window.scrollX, y: window.scrollY }
		await openLightbox(items[start]!)
		await userEvent.keyboard(direction === 'above' ? '{ArrowLeft}' : '{ArrowRight}')
		await expect.poll(activeSlideLabel).toBe(`${2 - start} of 2`)
		await transitionsDone()
		const destination = target.getBoundingClientRect()
		const sign = direction === 'above' ? -1 : 1
		expect(
			(direction === 'above' ? destination.bottom : destination.top - innerHeight) * sign,
		).toBeGreaterThan(0)
		const layer = currentLayer()
		const closing = closeLightbox()
		const verticalTravel = Number(layer.style.translate.split(' ', 2)[1]!.replace('px', ''))
		expect(verticalTravel * sign).toBeGreaterThan(innerHeight / 2)
		expect({ x: window.scrollX, y: window.scrollY }).toEqual(scroll)
		await closing
		expect({ x: window.scrollX, y: window.scrollY }).toEqual(scroll)
		expect(document.activeElement).toBe(target)
	},
)

it('closes toward a thumbnail clipped by a nested scroller without moving either scroll position', async () => {
	const fixture = mount(
		`<div style="height: 100vh"></div><div class="scroller" style="width: 240px; height: 260px; overflow: auto"><div style="display: flex; width: 1500px; gap: 800px">${imageItem('data-gallery="clipped"')}${imageItem('data-gallery="clipped"')}</div></div><div style="height: 100vh"></div>`,
	)
	await Promise.all(Array.from(fixture.querySelectorAll('img'), async (image) => image.decode()))
	const scroller = query(fixture, '.scroller')
	const items = boxes(fixture)
	scroller.scrollIntoView({ behavior: 'instant', block: 'center' })
	const scroll = { left: scroller.scrollLeft, page: window.scrollY, top: scroller.scrollTop }
	await openLightbox(items[0]!)
	await userEvent.keyboard('{ArrowRight}')
	await expect.poll(activeSlideLabel).toBe('2 of 2')
	await transitionsDone()
	expect(items[1]!.getBoundingClientRect().left).toBeGreaterThan(
		scroller.getBoundingClientRect().right,
	)
	await closeLightbox()
	expect({ left: scroller.scrollLeft, page: window.scrollY, top: scroller.scrollTop }).toEqual(
		scroll,
	)
})
