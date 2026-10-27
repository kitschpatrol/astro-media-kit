// The player's footprint wherever the layout sizes it from its content: it
// takes the video's width when there is room and shrinks below it, as an image
// does, when there is not.

import { afterEach, expect, it } from 'vitest'
import { cleanUp, mount, mountPage, query } from './helpers'

afterEach(cleanUp)

/** The fixture's 640px-wide player, moved into the `[data-slot]` of `html`. */
async function placePlayer(html: string): Promise<HTMLElement> {
	const page = await mountPage('/zoom/')
	const player = query(page, '#video-no-controls .amk-video')
	query(mount(html), '[data-slot]').append(player)
	return query(player, 'media-container')
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
