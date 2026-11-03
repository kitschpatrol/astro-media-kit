import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

describe('image zoom indicators', () => {
	let fixture: Awaited<ReturnType<typeof buildFixture>>
	beforeAll(async () => {
		fixture = await buildFixture('core-image')
	})

	it('renders opt-in decorative indicators after the real media without leaking props', async () => {
		const $ = await fixture.readHTML('/zoom-indicator/')
		expect($('#default .amk-zoom-indicator')).toHaveLength(0)
		expect($('#disabled .amk-zoom-indicator')).toHaveLength(0)
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

	it('automatically enables a per-image slot and keeps it out of the caption and theme targets', async () => {
		const $ = await fixture.readHTML('/zoom-indicator/')
		const indicator = $('#custom .amk-zoom-indicator')
		expect(indicator.find('[data-custom-icon="local-indicator"]')).toHaveLength(1)
		expect(indicator.attr('data-amk-icon')).toBeUndefined()
		expect($('#custom figcaption').text()).toContain('Caption stays here.')
		expect($('#custom figcaption svg')).toHaveLength(0)
		expect($('#custom .amk-zoom').children().first().is('picture')).toBe(true)
		expect($('#selector .amk-zoom').children().first().hasClass('amk-picture')).toBe(true)
	})
})
