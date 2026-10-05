import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

const whitespacePattern = /\s+/v
const assetPattern = /^\/_astro\//v

describe('Liftbox server markup', () => {
	let fixture: Awaited<ReturnType<typeof buildFixture>>
	beforeAll(async () => {
		fixture = await buildFixture('core-image')
	})

	it('links to the largest generated fallback candidate without combining picture formats', async () => {
		const $ = await fixture.readHTML('/liftbox/')
		const link = $('#first a[data-liftbox]').first()
		const candidates = link
			.find('img')
			.attr('srcset')!
			.split(',')
			.map((entry) => entry.trim().split(whitespacePattern))
		const largest = candidates.toSorted(
			(a, b) => Number(b[1]!.slice(0, -1)) - Number(a[1]!.slice(0, -1)),
		)[0]!
		expect(link.attr('href')).toBe(largest[0])
		expect(link.attr('href')).toMatch(assetPattern)
		expect(link.attr('data-liftbox')).toBe('trip')
		expect(link.attr('data-liftbox-scope')).toBe('article')
		expect(link.parent('figure').children('figcaption').text()).toContain('Picture caption')
	})

	it('keeps real player controls and theme markup, with no cloned lightbox player', async () => {
		const $ = await fixture.readHTML('/liftbox/')
		expect($('#video video-player')).toHaveLength(1)
		expect($('#video template')).toHaveLength(0)
		expect($('#video a[data-liftbox]')).toHaveLength(0)
		expect($('#video button[data-liftbox-open]')).toHaveLength(1)
		expect($('#second [data-liftbox] > .amk-picture > picture')).toHaveLength(2)
		expect($('#second .amk-dark img').attr('alt')).toBe('Themed picture')
		expect($('#second .amk-dark img').attr('aria-hidden')).toBeUndefined()
		expect($('#disabled [data-liftbox]')).toHaveLength(0)
		expect($('lift-box, .pswp-zoom')).toHaveLength(0)
	})
})
