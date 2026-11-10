import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

describe('carousel server markup', () => {
	let fixture: Awaited<ReturnType<typeof buildFixture>>
	beforeAll(async () => {
		fixture = await buildFixture('core-image')
	})

	it('wraps each slotted component in a labeled slide, with the buttons and dots asked for', async () => {
		const $ = await fixture.readHTML('/carousel/')
		const carousel = $('#captioned .amk-carousel')
		expect(carousel.attr('role')).toBe('region')
		expect(carousel.attr('aria-roledescription')).toBe('carousel')
		expect(carousel.attr('aria-label')).toBe('Penguins')
		expect(carousel.attr('data-captions')).toBe('')
		const slides = carousel.find('.amk-carousel-track > .amk-carousel-slide')
		expect(slides).toHaveLength(3)
		expect(slides.eq(0).attr('aria-label')).toBe('1 of 3')
		expect(slides.eq(2).attr('aria-label')).toBe('3 of 3')
		expect(slides.eq(0).find('figure > figcaption').text()).toContain('First caption')
		expect(slides.eq(0).find('a.amk-zoom[data-gallery="penguins"] picture')).toHaveLength(1)
		expect(slides.eq(1).find('a.amk-zoom img').attr('alt')).toBe('Second')
		expect(carousel.find('.amk-carousel-previous').attr('aria-disabled')).toBe('true')
		expect(carousel.find('.amk-carousel-next')).toHaveLength(1)
		const dots = carousel.find('.amk-carousel-dots > .amk-carousel-dot')
		expect(dots).toHaveLength(3)
		expect(dots.eq(0).attr('aria-current')).toBe('true')
		expect(dots.eq(1).attr('aria-current')).toBeUndefined()
	})

	it('keeps text that reads as a character reference in a slide attribute as written', async () => {
		const $ = await fixture.readHTML('/entities/')
		expect($('#carousel .amk-carousel-slide img').first().attr('alt')).toBe('&copy; as written')
	})

	it('keeps the scripts and styles the slides emit outside the track', async () => {
		const $ = await fixture.readHTML('/carousel/')
		// A script a captioned slide carries inside its figure is the component's own
		expect(
			$('.amk-carousel-track > :is(script, style), .amk-carousel-slide > :is(script, style)'),
		).toHaveLength(0)
		// The themed picture's selector style travels with the carousel
		expect($('#captioned .amk-carousel > style')).toHaveLength(1)
		expect($('script[type="module"]').length).toBeGreaterThan(0)
		expect(
			$('.amk-carousel-slide').filter((_index, slide) => $(slide).children().length !== 1),
		).toHaveLength(0)
	})

	it('omits navigation for a lone slide, and dots unless asked', async () => {
		const $ = await fixture.readHTML('/carousel/')
		expect($('#quiet .amk-carousel-slide')).toHaveLength(2)
		expect($('#quiet .amk-carousel-dots')).toHaveLength(0)
		expect($('#quiet .amk-carousel').attr('data-captions')).toBeUndefined()
		expect($('#quiet figcaption')).toHaveLength(1)
		expect($('#lone .amk-carousel-slide')).toHaveLength(1)
		expect($('#lone .amk-carousel-button, #lone .amk-carousel-dots')).toHaveLength(0)
		expect($('#lone .amk-carousel').attr('aria-label')).toBe('Carousel')
	})
})
