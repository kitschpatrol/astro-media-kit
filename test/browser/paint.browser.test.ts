import { expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import './helpers'

it('keeps the page visible in every captured frame while opening an image beside a video', async ({
	skip,
}) => {
	const result = await commands.lightboxPaint()
	if (result === false) {
		skip()
		return
	}

	expect(result.frames).toBeGreaterThan(5)
	expect(result.opaque).toBe(0)
})
