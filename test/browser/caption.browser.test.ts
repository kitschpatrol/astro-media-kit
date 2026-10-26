import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import { boxes, cleanUp, item, mount, query, setUpLightbox } from './helpers'

setUpLightbox()
afterEach(cleanUp)

/** A captioned image item of the given natural height, 2400 wide. */
function captioned(name: string, height: number): string {
	return `<figure>${item(
		`<img src="/media/${name}-480.jpg" width="2400" height="${height}" alt=""
			style="display: block; width: 100%; height: auto" />`,
		'data-gallery="captions" style="width: 200px"',
	)}<figcaption>${name}</figcaption></figure>`
}

it('puts the caption beside a subject with room next to it, and below one without', async () => {
	const fixture = mount(captioned('dune', 3600) + captioned('horizon', 1029))
	for (const image of fixture.querySelectorAll('img')) {
		await image.decode()
	}

	await openLightbox(boxes(fixture)[0]!)
	const [portrait, wide] = document.querySelectorAll<HTMLElement>('.amk-lightbox-slide')
	expect(portrait!.dataset.caption).toBe('aside')
	const frame = query(portrait!, '.amk-lightbox-frame').getBoundingClientRect()
	const caption = query(portrait!, '.amk-lightbox-caption').getBoundingClientRect()
	expect(caption.x).toBeGreaterThanOrEqual(frame.right)
	expect(frame.height).toBeCloseTo(
		query(portrait!, '.amk-lightbox-stage').getBoundingClientRect().height,
		0,
	)

	// The neighbor is lifted, and its caption placed, once the opening settles
	await expect.poll(() => wide!.dataset.caption).toBe('below')
	const wideFrame = query(wide!, '.amk-lightbox-frame').getBoundingClientRect()
	const wideCaption = query(wide!, '.amk-lightbox-caption').getBoundingClientRect()
	expect(wideCaption.y).toBeGreaterThanOrEqual(wideFrame.bottom)
})

it('moves the caption below when a resize leaves no room beside the subject', async () => {
	const fixture = mount(captioned('dune', 3600))
	await query(fixture, 'img', HTMLImageElement).decode()
	await openLightbox(boxes(fixture)[0]!)
	const slide = query(document, '.amk-lightbox-slide')
	expect(slide.dataset.caption).toBe('aside')
	try {
		await page.viewport(500, 900)
		await expect.poll(() => slide.dataset.caption).toBe('below')
		await page.viewport(1280, 800)
		await expect.poll(() => slide.dataset.caption).toBe('aside')
	} finally {
		await page.viewport(1280, 800)
	}
})
