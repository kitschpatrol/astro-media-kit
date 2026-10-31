import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { parseMediaThemeIcon } from '../src/components/utils/media-theme'

describe('MediaTheme icon validation', () => {
	it.each(['default', 'play', 'icon-unknown'])(
		'rejects the unsupported slot %s with its name in the error',
		(slot) => {
			expect(() => parseMediaThemeIcon(slot, '<svg />')).toThrow(
				`Unknown MediaTheme slot "${slot}"`,
			)
		},
	)

	it.each([
		'',
		'Caption',
		'<span><svg /></span>',
		'<svg /><svg />',
		'Caption <svg />',
		'<svg /> Caption',
	])('rejects content that is not a single SVG: %s', (markup) => {
		expect(() => parseMediaThemeIcon('icon-play', markup)).toThrow(
			'MediaTheme slot "icon-play" must render one SVG',
		)
	})

	it('preserves artwork and scoped style attributes while enforcing decorative semantics', () => {
		const icon = parseMediaThemeIcon(
			'icon-play',
			`<!-- Before -->
			<svg slot="icon-play" aria-hidden="false" focusable="true"
				class="custom" data-astro-cid-test viewBox="0 0 32 32" fill="none">
				<title>Play</title><path d="M4 4 28 16 4 28Z" stroke="currentColor" />
			</svg>
			<!-- After -->`,
		)
		const $ = load(icon.markup)
		const svg = $('svg')
		expect(icon.name).toBe('play')
		expect(svg.attr('viewBox')).toBe('0 0 32 32')
		expect(svg.attr('fill')).toBe('none')
		expect(svg.attr('class')).toBe('custom')
		expect(svg.is('[data-astro-cid-test]')).toBe(true)
		expect(svg.attr('aria-hidden')).toBe('true')
		expect(svg.attr('focusable')).toBe('false')
		expect(svg.attr('slot')).toBeUndefined()
		expect(svg.find('title').text()).toBe('Play')
		expect(svg.find('path').attr('d')).toBe('M4 4 28 16 4 28Z')
	})
})
