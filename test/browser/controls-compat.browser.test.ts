import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	boxes,
	cleanUp,
	mount,
	query,
	setUpLightbox,
	viewer,
	zoomable,
} from './helpers'

setUpLightbox()
afterEach(async () => {
	await cleanUp()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

it.each([true, false])(
	'navigates, zooms, and closes with command API support set to %s',
	async (hasCommandApi) => {
		if (!hasCommandApi) {
			vi.stubGlobal('CommandEvent', undefined)
			vi.spyOn(HTMLButtonElement.prototype, 'commandForElement', 'set').mockImplementation(() => {
				// A browser without command support does not associate the target.
			})
			// Chrome 135–138 has command buttons but no request-close action.
			vi.spyOn(HTMLDialogElement.prototype, 'requestClose').mockImplementation(() => {
				// Unsupported request-close actions have no effect.
			})
		}

		const fixture = mount(Array.from({ length: 3 }, () => zoomable('native')).join(''))
		for (const image of fixture.querySelectorAll('img')) {
			image.loading = 'eager'
			await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true)
		}

		await openLightbox(boxes(fixture)[0]!)
		expect(activeSlideLabel()).toBe('1 of 3')

		const zoom = query(viewer(), '.amk-lightbox-zoom')
		await userEvent.click(zoom)
		await expect.poll(() => zoom.getAttribute('aria-pressed')).toBe('true')
		await userEvent.click(zoom)
		await expect.poll(() => zoom.getAttribute('aria-pressed')).toBe('false')

		await userEvent.click(query(viewer(), '.amk-lightbox-next'))
		await expect.poll(activeSlideLabel).toBe('2 of 3')
		await userEvent.click(query(viewer(), '.amk-lightbox-previous'))
		await expect.poll(activeSlideLabel).toBe('1 of 3')

		await userEvent.click(query(viewer(), '.amk-lightbox-close'))
		await expect.poll(() => viewer().open).toBe(false)
		for (const item of boxes(fixture)) {
			expect(item.querySelector('img')).not.toBeNull()
		}
	},
)
