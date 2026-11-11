import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	block,
	boxes,
	cleanUp,
	frames,
	gallery,
	item,
	mount,
	mountPage,
	query,
	setUpLightbox,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

/** A fluid image, 40% of the viewport wide, as a responsive page lays it out. */
function fluidImage(): string {
	return item(
		`<img src="/media/aurora-480.jpg" width="2400" height="1600" alt=""
			style="display: block; width: 100%; height: auto" />`,
		'style="width: 40vw"',
	)
}

it('holds a container-sized wrapper by ratio, so its space follows a resize and the subject lands there', async () => {
	const fixture = mount(fluidImage())
	const box = boxes(fixture)[0]!
	const image = query(fixture, 'img', HTMLImageElement)
	await image.decode()
	const wide = box.getBoundingClientRect()
	await openLightbox(box)
	expect(box.dataset.lifted).toBe('ratio')
	try {
		await page.viewport(800, 600)
		await expect.poll(() => box.getBoundingClientRect().width).toBeCloseTo(320, 0)
		const held = box.getBoundingClientRect()
		expect(held.height).toBeCloseTo((held.width * wide.height) / wide.width, 0)
		const preview = query(box, '[data-amk-preview]').getBoundingClientRect()
		expect(preview.x).toBeCloseTo(held.x, 0)
		expect(preview.y).toBeCloseTo(held.y, 0)
		expect(preview.width).toBeCloseTo(held.width, 0)
		expect(preview.height).toBeCloseTo(held.height, 0)

		const closing = closeLightbox()
		expect(viewer().dataset.state).toBe('closing')
		await closing
		expect(viewer().open).toBe(false)
		const after = image.getBoundingClientRect()
		expect(after.x).toBeCloseTo(preview.x, 0)
		expect(after.y).toBeCloseTo(preview.y, 0)
		expect(after.width).toBeCloseTo(preview.width, 0)
		expect(after.height).toBeCloseTo(preview.height, 0)
	} finally {
		await page.viewport(1280, 800)
	}
})

it('holds a content-sized wrapper at its size, and one with a size of its own not at all', async () => {
	const fixture = mount(`
		${item(block('a'), 'style="display: inline-block"')}
		${item(
			`<img src="/media/aurora-480.jpg" width="2400" height="1600" alt=""
				style="display: block; width: 100%; height: 100%; object-fit: cover" />`,
			'style="width: 50vw; aspect-ratio: 1"',
		)}`)
	const [sized, shaped] = boxes(fixture)
	await query(fixture, 'img', HTMLImageElement).decode()
	await openLightbox(sized!)
	expect(sized!.dataset.lifted).toBe('size')
	try {
		await page.viewport(800, 600)
		await expect.poll(() => shaped!.getBoundingClientRect().width).toBeCloseTo(400, 0)
		expect(sized!.getBoundingClientRect().width).toBeCloseTo(240, 0)
		expect(sized!.getBoundingClientRect().height).toBeCloseTo(160, 0)
		await closeLightbox()
		expect(query(sized!, '.subject').getBoundingClientRect().width).toBeCloseTo(240, 0)

		await openLightbox(shaped!)
		expect(shaped!.dataset.lifted).toBe('')
		await page.viewport(1000, 700)
		await expect.poll(() => shaped!.getBoundingClientRect().width).toBeCloseTo(500, 0)
		expect(shaped!.getBoundingClientRect().height).toBeCloseTo(500, 0)
		const preview = query(shaped!, '[data-amk-preview]').getBoundingClientRect()
		expect(preview.width).toBeCloseTo(500, 0)
		expect(preview.height).toBeCloseTo(500, 0)
		await closeLightbox()
		expect(query(shaped!, 'img').getBoundingClientRect().height).toBeCloseTo(500, 0)
	} finally {
		await page.viewport(1280, 800)
	}
})

it('lets a content-sized wrapper follow a resize that changes its content, and lands the subject there', async () => {
	// A wrapper that shrinks to an image, which shrinks to its column
	const fixture = mount(
		`<div style="width: 25vw">${item(
			`<img src="/media/aurora-480.jpg" width="480" height="320" alt=""
				style="display: block; max-width: 100%; height: auto" />`,
			'style="display: inline-block; max-width: 100%; vertical-align: top"',
		)}</div>`,
	)
	const box = boxes(fixture)[0]!
	const image = query(fixture, 'img', HTMLImageElement)
	await image.decode()
	expect(box.getBoundingClientRect().width).toBeCloseTo(320, 0)
	await openLightbox(box)
	expect(box.dataset.lifted).toBe('size')
	try {
		await page.viewport(800, 600)
		// The size it had is out of date now: the image would be 200px wide here.
		// Its height says so, where the column alone narrows a wrapper that is held
		await expect.poll(() => box.getBoundingClientRect().height).toBeCloseTo(200 / 1.5, 0)
		expect(box.getBoundingClientRect().width).toBeCloseTo(200, 0)
		const preview = query(box, '[data-amk-preview]').getBoundingClientRect()
		expect(preview.width).toBeCloseTo(200, 0)
		expect(preview.height).toBeCloseTo(200 / 1.5, 0)
		// What stands in for the image takes its room, and shows nothing
		const probe = query(box, '[data-amk-probe]')
		expect(getComputedStyle(probe).visibility).toBe('hidden')
		expect(probe.inert).toBe(true)

		await page.viewport(1000, 700)
		await expect.poll(() => box.getBoundingClientRect().width).toBeCloseTo(250, 0)
		expect(box.querySelectorAll('[data-amk-probe]')).toHaveLength(1)

		await closeLightbox()
		expect(image.parentElement).toBe(box)
		expect(image.getBoundingClientRect().width).toBeCloseTo(250, 0)
		expect(box.querySelector('[data-amk-probe]')).toBeNull()
		expect(box.hasAttribute('style')).toBe(true)
		expect(box.style.getPropertyValue('--amk-lightbox-placeholder-width')).toBe('')
	} finally {
		await page.viewport(1280, 800)
	}
})

it("stands in for the kit's player with its box alone, and lands it at its new size", async () => {
	const fixture = await mountPage('/zoom/')
	const section = query(fixture, '#video')
	section.style.width = '25vw'
	const box = query(section, '.amk-zoom')
	const container = query(box, 'media-container')
	expect(container.getBoundingClientRect().width).toBeCloseTo(320, 0)
	await openLightbox(box)
	expect(box.dataset.lifted).toBe('size')
	try {
		await page.viewport(800, 600)
		await expect.poll(() => box.getBoundingClientRect().width).toBeCloseTo(200, 0)
		expect(box.getBoundingClientRect().height).toBeCloseTo((200 * 9) / 16, 0)
		// Never a second player: only boxes of the player's size
		const probe = query(box, '[data-amk-probe]')
		expect(probe.classList.contains('amk-video')).toBe(true)
		expect(probe.querySelector('video-player, media-container, video')).toBeNull()

		await closeLightbox()
		expect(container.getBoundingClientRect().width).toBeCloseTo(200, 0)
		expect(container.getBoundingClientRect().height).toBeCloseTo((200 * 9) / 16, 0)
		expect(box.querySelector('[data-amk-probe]')).toBeNull()
	} finally {
		await page.viewport(1280, 800)
	}
})

it('points a subject on its way home at its new place when the viewport resizes meanwhile', async () => {
	const fixture = mount(fluidImage())
	const box = boxes(fixture)[0]!
	const image = query(fixture, 'img', HTMLImageElement)
	await image.decode()
	await openLightbox(box)
	// A long way home, so the resize lands while it is still under way. The
	// transitions that replace it then use the test speed again
	viewer().style.setProperty('--amk-lightbox-duration', '2s')
	const closing = closeLightbox()
	viewer().style.removeProperty('--amk-lightbox-duration')

	try {
		await page.viewport(800, 600)
		await expect.poll(() => box.getBoundingClientRect().width).toBeCloseTo(320, 0)
		expect(viewer().dataset.state).toBe('closing')
		await closing
		expect(viewer().open).toBe(false)
		expect(image.parentElement).toBe(box)
		expect(image.getBoundingClientRect().width).toBeCloseTo(320, 0)
	} finally {
		await page.viewport(1280, 800)
	}
})

it('stays on the same slide when the viewport resizes', async () => {
	const fixture = mount(gallery(['a', 'b', 'c']))
	await openLightbox(boxes(fixture)[2]!)
	const track = query(document, '.amk-lightbox-track')

	try {
		await page.viewport(700, 600)
		await expect.poll(() => Math.abs(track.scrollLeft) - 2 * track.clientWidth).toBeCloseTo(0, 0)
		expect(activeSlideLabel()).toBe('3 of 3')
	} finally {
		await page.viewport(1280, 800)
	}
})

it('stays on the same slide when a scroll ends before the resize that caused it is handled', async () => {
	const fixture = mount(gallery(['a', 'b', 'c']))
	await openLightbox(boxes(fixture)[2]!)
	const track = query(document, '.amk-lightbox-track')

	try {
		// Narrower, the track clamps its offset. Browsers can report the end of that
		// scroll first, while the viewer still has the old width, as slow ones do.
		track.style.width = '700px'
		expect(track.scrollLeft).toBe(1400)
		track.dispatchEvent(new Event('scrollend'))
		await expect.poll(() => Object.hasOwn(track.dataset, 'moving')).toBe(false)
		await frames()

		expect(track.scrollLeft).toBe(1400)
		expect(activeSlideLabel()).toBe('3 of 3')
	} finally {
		track.style.removeProperty('width')
	}
})
