import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

const ASTRO_ASSET_PATH_REGEX = /^\/_astro\//v

describe('auto-import in an Astro project outside the working directory', () => {
	let fixture: Awaited<ReturnType<typeof buildFixture>>

	beforeAll(async () => {
		fixture = await buildFixture('core-image')
	})

	it('builds root-relative source imports as optimized images with inferred dimensions', async () => {
		const $ = await fixture.readHTML('/auto-import/')
		for (const selector of ['#root-image', '#root-picture img']) {
			const image = $(selector)
			expect(image.attr('src')).toMatch(ASTRO_ASSET_PATH_REGEX)
			expect(Number(image.attr('width'))).toBeGreaterThan(0)
			expect(Number(image.attr('height'))).toBeGreaterThan(0)
		}
	})

	it('keeps public image URLs untouched', async () => {
		const $ = await fixture.readHTML('/auto-import/')
		expect($('#public-image').attr('src')).toBe('/media/aurora-480.jpg')
		expect($('#public-image').attr('width')).toBe('480')
		expect($('#public-image').attr('height')).toBe('320')
	})
})
