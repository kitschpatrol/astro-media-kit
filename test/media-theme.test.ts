import { load } from 'cheerio'
import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

describe('MediaTheme rendering', () => {
	let readHTML: Awaited<ReturnType<typeof buildFixture>>['readHTML']
	let distribution: string
	beforeAll(async () => {
		;({ dist: distribution, readHTML } = await buildFixture('core-image'))
	})

	it('renders Astro icon components as inert, decorative SVG templates', async () => {
		const $ = await readHTML('/media-theme/')
		const theme = $('[data-amk-media-theme]')
		expect(theme.is('template')).toBe(true)
		const icons = load(theme.html()!)
		expect(icons('template')).toHaveLength(9)
		const play = load(icons('template[data-amk-icon="play"]').html()!)('svg')
		expect(play.attr('data-custom-icon')).toBe('play')
		expect(play.attr('aria-hidden')).toBe('true')
		expect(play.attr('focusable')).toBe('false')
		expect(play.attr('slot')).toBeUndefined()
	})

	it('keeps theme configuration outside carousel slides', async () => {
		const $ = await readHTML('/media-theme-image/')
		expect($('.amk-carousel-slide')).toHaveLength(2)
		expect($('.amk-carousel-dot')).toHaveLength(2)
		expect($('.amk-carousel-slide [data-amk-media-theme]')).toHaveLength(0)
		expect($('.amk-carousel > [data-amk-media-theme]')).toHaveLength(1)
	})

	it('links the audio skin only from rendered audio players', async () => {
		const image = await readHTML('/media-theme-image/')
		const imageLinks = image('link[rel="stylesheet"]')
			.map((_, link) => image(link).attr('href')!)
			.get()
		const styles = await Promise.all(
			imageLinks.map(async (href) => readFile(`${distribution}${href}`, 'utf8')),
		)
		expect(styles.join('\n')).not.toContain('.audio-controls-start')
		const audio = await readHTML('/media-theme/')
		const links = audio('body link[rel="stylesheet"]')
			.map((_, link) => audio(link).attr('href')!)
			.get()
		expect(links).toHaveLength(2)
		expect(new Set(links).size).toBe(1)
		expect(await readFile(`${distribution}${links[0]!}`, 'utf8')).toContain('.audio-controls-start')
	})

	it('gives every audio instance independent menu, popover, and tooltip targets', async () => {
		const $ = await readHTML('/media-theme/')
		const ids = $('#audio [id]')
			.map((_, element) => $(element).attr('id')!)
			.get()
		expect(new Set(ids).size).toBe(ids.length)
		$('#audio audio-player').each((_, player) => {
			$(player)
				.find('[trigger], [commandfor]')
				.each((_controlIndex, control) => {
					const target = $(control).attr('trigger') ?? $(control).attr('commandfor')!
					expect($(player).find(`[id="${target}"]`)).toHaveLength(1)
				})
		})
	})
})
