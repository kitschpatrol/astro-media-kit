import { afterEach, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	block,
	boxes,
	cleanUp,
	gallery,
	item,
	mount,
	query,
	setUpLightbox,
	transitionsDone,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

it('leaves Space to a focused scroller inside the lifted content', async () => {
	const fixture = mount(
		item(
			`<div class="scroller" tabindex="0" style="overflow: auto; height: 120px; background: teal">
				<p style="height: 900px; margin: 0">Long</p>
			</div>`,
			'style="width: 240px"',
		),
	)
	await openLightbox(boxes(fixture)[0]!)
	const scroller = query(viewer(), '.scroller')
	scroller.focus()

	await userEvent.keyboard(' ')

	expect(viewer().open).toBe(true)
	await expect.poll(() => scroller.scrollTop).toBeGreaterThan(0)
})

it('tells screen readers which slide is current, with its caption or media name', async () => {
	const fixture = mount(`
		<figure>${item(block('a'), 'data-gallery="live"')}<figcaption>First caption</figcaption></figure>
		${item(
			'<img src="/media/tile-480.jpg" width="2400" height="2400" alt="A tile" style="display: block; width: 240px; height: auto" />',
			'data-gallery="live"',
		)}`)
	await query(fixture, 'img', HTMLImageElement).decode()
	await openLightbox(boxes(fixture)[0]!)
	const status = query(viewer(), '.amk-lightbox-status')
	expect(status.getAttribute('role')).toBe('status')
	expect(status.textContent).toBe('1 of 2, First caption')

	query(document, '.amk-lightbox-next').click()
	await expect.poll(activeSlideLabel).toBe('2 of 2')
	expect(status.textContent).toBe('2 of 2, A tile')
})

it('keeps the arrows hidden while a lone item takes over from another', async () => {
	const fixture = mount(`${item(block('a'))}${item(block('b'))}`)
	const [a, b] = boxes(fixture)
	await openLightbox(a!)
	expect(Object.hasOwn(viewer().dataset, 'lone')).toBe(true)
	const next = query(document, '.amk-lightbox-next')
	expect(getComputedStyle(next).visibility).toBe('hidden')

	const closing = closeLightbox()
	const opening = openLightbox(b!)
	expect(document.querySelectorAll('.amk-lightbox-slide[data-ghost]')).toHaveLength(1)
	expect(Object.hasOwn(viewer().dataset, 'lone')).toBe(true)
	expect(getComputedStyle(next).visibility).toBe('hidden')
	await Promise.all([closing, opening])
	await transitionsDone()
	expect(getComputedStyle(next).visibility).toBe('hidden')
})

it('shows the arrows for a gallery', async () => {
	const fixture = mount(gallery(['a', 'b']))
	await openLightbox(boxes(fixture)[0]!)
	expect(Object.hasOwn(viewer().dataset, 'lone')).toBe(false)
	expect(getComputedStyle(query(document, '.amk-lightbox-next')).visibility).toBe('visible')
})

it('copies a caption without its dead controls and focus stops, keeping links', async () => {
	const fixture = mount(`<figure>${item(block('a'))}<figcaption>
		Read <a href="#more">more</a> <span tabindex="0">stop</span>
		<span role="button">press</span> <details><summary>open</summary>hidden</details>
		<button type="button">go</button>
	</figcaption></figure>`)
	await openLightbox(boxes(fixture)[0]!)
	const caption = query(viewer(), '.amk-lightbox-caption')

	expect(caption.querySelector('a[href]')).not.toBeNull()
	expect(caption.querySelector('[tabindex]')).toBeNull()
	expect(caption.querySelector('[role="button"], summary, button')).toBeNull()
	expect(caption.textContent).toContain('stop')
})

it('makes a caption that overflows focusable, so it can be scrolled from the keyboard', async () => {
	const fixture =
		mount(`<figure>${item(block('a'))}<figcaption>${'Long caption text. '.repeat(400)}</figcaption></figure>
		<figure>${item(block('b'))}<figcaption>Short.</figcaption></figure>`)
	const [long, short] = boxes(fixture)
	await openLightbox(long!)
	const caption = query(viewer(), '.amk-lightbox-caption')
	expect(caption.scrollHeight).toBeGreaterThan(caption.clientHeight)
	expect(caption.tabIndex).toBe(0)
	caption.focus()
	await userEvent.keyboard(' ')
	expect(viewer().open).toBe(true)
	await expect.poll(() => caption.scrollTop).toBeGreaterThan(0)
	await closeLightbox()

	await openLightbox(short!)
	expect(query(viewer(), '.amk-lightbox-caption').hasAttribute('tabindex')).toBe(false)
})

it('lets a nested modal consume Escape before the gallery', async () => {
	const fixture = mount(
		item(
			'<div style="width: 200px; height: 100px"><dialog id="nested"><button autofocus>Done</button></dialog></div>',
		),
	)
	await openLightbox(boxes(fixture)[0]!)
	const nested = document.querySelector<HTMLDialogElement>('#nested')!
	nested.showModal()
	await userEvent.keyboard('{Escape}')
	await expect.poll(() => nested.open).toBe(false)
	expect(viewer().open).toBe(true)
	await userEvent.keyboard('{Escape}')
	await expect.poll(() => viewer().open).toBe(false)
})

it('removes hidden caption links from focus navigation during zoom', async () => {
	const fixture = mount(
		`<figure>${item(
			'<img src="/media/tile-2400.jpg" width="2400" height="2400" alt="Tile" style="width: 100%; height: auto" />',
			'data-level="fill" style="width: 200px"',
		)}<figcaption><a href="#credit">Credit</a></figcaption></figure>`,
	)
	await query(fixture, 'img', HTMLImageElement).decode()
	await openLightbox(boxes(fixture)[0]!)
	const caption = query(viewer(), '.amk-lightbox-caption')
	const link = caption.querySelector('a')!
	const zoom = query(document, '.amk-lightbox-zoom')
	link.focus()
	zoom.click()
	link.focus()
	expect(caption.inert).toBe(true)
	expect(document.activeElement).not.toBe(link)
	zoom.click()
	link.focus()
	expect(caption.inert).toBe(false)
	expect(document.activeElement).toBe(link)
})

it('covers the viewport in both reading directions', async () => {
	const root = document.documentElement
	const original = root.getAttribute('dir')
	try {
		for (const direction of ['ltr', 'rtl']) {
			root.dir = direction
			await openLightbox(boxes(mount(item('<div style="width: 200px; height: 100px"></div>')))[0]!)
			const box = viewer().getBoundingClientRect()
			expect(box.x).toBeCloseTo(0, 0)
			expect(box.width).toBeCloseTo(window.innerWidth, 0)
			expect(Number(getComputedStyle(viewer(), '::backdrop').width.replace('px', ''))).toBeCloseTo(
				window.innerWidth,
				0,
			)
			await closeLightbox(true)
		}
	} finally {
		if (original === null) {
			root.toggleAttribute('dir', false)
		} else {
			root.setAttribute('dir', original)
		}
	}
})

it('resets stale zoom geometry after a height-only resize', async () => {
	const fixture = mount(
		item(
			'<img src="/media/tile-2400.jpg" width="2400" height="2400" alt="Tile" style="width: 100%; height: auto" />',
			'data-level="fill" style="width: 200px"',
		),
	)
	await query(fixture, 'img', HTMLImageElement).decode()
	await openLightbox(boxes(fixture)[0]!)
	const zoom = query(document, '.amk-lightbox-zoom')
	zoom.click()
	expect(viewer().querySelector('[data-zoomed]')).not.toBeNull()
	try {
		await page.viewport(1280, 1500)
		await expect.poll(() => viewer().querySelector('[data-zoomed]')).toBeNull()
		zoom.click()
		await expect
			.poll(() => query(document, '.amk-lightbox-frame').getBoundingClientRect().width)
			.toBe(1500)
	} finally {
		await page.viewport(1280, 800)
	}
})
