// The lightbox against the markup the components render, from the fixture that
// `test/zoom.test.ts` also builds: a real page, with its own styles and assets.

import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	boxes,
	cleanUp,
	close,
	currentLayer,
	isLifted,
	mountPage,
	query,
	setUpLightbox,
	transitionsDone,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

it('lays the rendered links out as blocks from the bundled stylesheet alone', async () => {
	const fixture = await mountPage('/zoom/')
	const link = query(fixture, '#first a.amk-zoom')
	expect(getComputedStyle(link).display).toBe('block')
	expect(getComputedStyle(link).cursor).toBe('zoom-in')
	expect(getComputedStyle(query(fixture, '#video .amk-zoom')).cursor).not.toBe('zoom-in')
})

it('opens viewer-owned photos within the rendered gallery’s scope', async () => {
	const fixture = await mountPage('/zoom/')
	const [picture, image] = boxes(query(fixture, '#first'))
	const original = query(picture!, 'picture')
	const neighbor = image!.firstElementChild
	const markup = original.outerHTML
	for (const img of fixture.querySelectorAll<HTMLImageElement>(':scope #first img')) {
		await expect.poll(() => img.complete && img.naturalWidth > 0).toBe(true)
	}

	await userEvent.click(picture!)

	await expect.poll(() => viewer().dataset.state).toBe('open')
	expect(activeSlideLabel()).toBe('1 of 2')
	const copy = query(currentLayer(), 'picture')
	expect(copy).not.toBe(original)
	expect(query(copy, 'source', HTMLSourceElement).srcset).toBe(
		query(original, 'source', HTMLSourceElement).srcset,
	)
	expect(original.parentElement).toBe(picture)
	expect(original.outerHTML).toBe(markup)
	// The neighbor follows once the opening transition settles
	await expect.poll(() => isLifted(image!)).toBe(true)
	expect(image!.firstElementChild).toBe(neighbor)
	expect(picture!.querySelector('[data-amk-preview]')).toBeNull()
	expect(document.querySelectorAll('#second .amk-zoom[data-lifted]')).toHaveLength(0)
	const caption = query(viewer(), '.amk-lightbox-caption')
	expect(caption.textContent).toContain('Picture caption')
	await close()
	expect(original.parentElement).toBe(picture)
})

it('zooms a rendered picture to the width the server supplied', async () => {
	const fixture = await mountPage('/zoom/')
	const picture = boxes(query(fixture, '#first'))[0]!
	expect(picture.dataset.nativeWidth).toBe('960')
	await openLightbox(picture)
	await transitionsDone()
	const fitted = currentLayer().getBoundingClientRect().width

	query(document, '.amk-lightbox-zoom').click()
	await transitionsDone()

	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(960, 0)
	expect(fitted).toBeLessThan(960)
})

it('opens a themed picture from the visible thumbnail', async () => {
	const fixture = await mountPage('/zoom/')
	const themed = boxes(query(fixture, '#second'))[0]!
	const [dark, light] = themed.querySelectorAll('img')
	await expect.poll(() => light!.complete && light!.naturalWidth > 0).toBe(true)
	expect(dark!.checkVisibility()).toBe(false)

	const opening = openLightbox(themed)
	const start = currentLayer().getBoundingClientRect()
	await opening

	expect(themed.contains(dark!)).toBe(true)
	expect(themed.contains(light!)).toBe(true)
	expect(query(currentLayer(), '.amk-light img').checkVisibility()).toBe(true)
	expect(query(currentLayer(), '.amk-dark img').checkVisibility()).toBe(false)
	expect(start.width).toBeCloseTo(240, 0)
	await close()
	expect(themed.querySelectorAll('img')).toHaveLength(2)
})

it('lifts ordinary HTML the page wraps, which is a button', async () => {
	const fixture = await mountPage('/zoom/')
	const content = boxes(query(fixture, '#content'))[0]!
	expect(content.role).toBe('button')
	expect(content.tabIndex).toBe(0)

	content.focus()
	await userEvent.keyboard('{Enter}')

	await expect.poll(() => viewer().dataset.state).toBe('open')
	expect(viewer().textContent).toContain('Original HTML')
	await close()
})
