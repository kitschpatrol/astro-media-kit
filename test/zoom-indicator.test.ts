import { load } from 'cheerio'
import { beforeAll, describe, expect, it } from 'vitest'
import { expandIcon } from '../src/components/internal/zoom-icons'
import { buildFixture } from './parity/helpers/build-fixture'

describe('image zoom indicators', () => {
	let fixture: Awaited<ReturnType<typeof buildFixture>>
	beforeAll(async () => {
		fixture = await buildFixture('core-image')
	})

	it('renders opt-in decorative indicators after the real media without leaking props', async () => {
		const $ = await fixture.readHTML('/zoom-indicator/')
		expect($('#default .amk-zoom-indicator')).toHaveLength(0)
		expect($('#no-zoom .amk-zoom-indicator')).toHaveLength(0)
		const zoom = $('#builtin .amk-zoom')
		expect(zoom.children().first().is('img')).toBe(true)
		const indicator = zoom.children().last()
		expect(indicator.hasClass('amk-zoom-indicator')).toBe(true)
		expect(indicator.attr('aria-hidden')).toBe('true')
		expect(indicator.is('[inert]')).toBe(true)
		expect(indicator.attr('data-amk-icon')).toBe('zoom-indicator')
		expect(indicator.find('svg').attr('focusable')).toBe('false')
		expect($('img[zoomIndicator], img[indicator]')).toHaveLength(0)
	})

	it("draws the video player's expand artwork by default", async () => {
		const $ = await fixture.readHTML('/zoom-indicator/')
		const indicator = $('#builtin .amk-zoom-indicator svg')
		const expand = load(expandIcon)('svg')
		expect(indicator.attr('viewBox')).toBe(expand.attr('viewBox'))
		expect(indicator.attr('fill')).toBe(expand.attr('fill'))
		expect(indicator.find('path').attr('d')).toBe(expand.find('path').attr('d'))
	})

	it("keeps a Picture's indicator out of its caption", async () => {
		const $ = await fixture.readHTML('/zoom-indicator/')
		expect($('#captioned .amk-zoom-indicator')).toHaveLength(1)
		expect($('#captioned figcaption').text()).toContain('Caption stays here.')
		expect($('#captioned figcaption svg')).toHaveLength(0)
		expect($('#captioned .amk-zoom').children().first().is('picture')).toBe(true)
		expect($('#selector .amk-zoom').children().first().hasClass('amk-picture')).toBe(true)
	})
})
