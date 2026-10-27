// Media footprints wherever the layout sizes them from their content: the
// player takes the video's width when there is room and shrinks below it, as
// an image does, when there is not; provider embeds stay within the column.

import { afterEach, expect, it } from 'vitest'
import { cleanUp, mount, mountPage, query } from './helpers'

afterEach(cleanUp)

/** A fixture page's `selector`, moved into the `[data-slot]` of `html`. */
async function place(path: string, selector: string, html: string): Promise<HTMLElement> {
	const page = await mountPage(path)
	const media = query(page, selector)
	query(mount(html), '[data-slot]').append(media)
	return media
}

/** The fixture's 640px-wide player, placed in `html`, by its container. */
async function placePlayer(html: string): Promise<HTMLElement> {
	const player = await place('/zoom/', '#video-no-controls .amk-video', html)
	return query(player, 'media-container')
}

/** The size of `element`, rounded to whole pixels. */
function sizeOf(element: Element): { width: number; height: number } {
	const { width, height } = element.getBoundingClientRect()
	return { width: Math.round(width), height: Math.round(height) }
}

it('shrinks with a flex item narrower than the video', async () => {
	const container = await placePlayer(`
		<div style="display: flex; width: 400px">
			<div data-slot style="flex: 1"></div>
			<div style="flex: 1"></div>
		</div>`)
	expect(container.getBoundingClientRect().width).toBe(200)
})

it('takes the video width in a shrink-wrapped container with room for it', async () => {
	const container = await placePlayer('<div data-slot style="width: fit-content"></div>')
	expect(container.getBoundingClientRect().width).toBe(640)
})

it('keeps the video width in a wider column, and the column width in a narrower one', async () => {
	const wide = await placePlayer('<div data-slot style="width: 1000px"></div>')
	expect(wide.getBoundingClientRect().width).toBe(640)
	const narrow = await placePlayer('<div data-slot style="width: 300px"></div>')
	expect(narrow.getBoundingClientRect().width).toBe(300)
})

it('scales an oEmbed with a ratio to fill the column, and no further', async () => {
	const embed = await place(
		'/noscript-fallback/',
		'#oembed-video .amk-oembed',
		'<div data-slot style="width: 300px"></div>',
	)
	expect(sizeOf(embed)).toEqual({ width: 300, height: 169 })
	expect(sizeOf(query(embed, 'iframe'))).toEqual(sizeOf(embed))
})

it('keeps an oEmbed without a ratio at its own height, within the column', async () => {
	const embed = await place(
		'/noscript-fallback/',
		'#oembed-audio .amk-oembed',
		'<div data-slot style="width: 300px"></div>',
	)
	expect(sizeOf(query(embed, 'iframe'))).toEqual({ width: 300, height: 152 })
	expect(sizeOf(embed)).toEqual({ width: 300, height: 152 })
})
