import { load } from 'cheerio'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

describe('MediaTheme rendering', () => {
	let readHTML: Awaited<ReturnType<typeof buildFixture>>['readHTML']
	beforeAll(async () => {
		;({ readHTML } = await buildFixture('core-image'))
	})

	it('renders Astro icon components as inert, decorative SVG templates', async () => {
		const $ = await readHTML('/media-theme/')
		const theme = $('[data-amk-media-theme]')
		expect(theme.is('[hidden]')).toBe(true)
		expect(theme.find('template')).toHaveLength(9)
		const play = load(theme.find('template[data-amk-icon="play"]').html()!)('svg')
		expect(play.attr('data-custom-icon')).toBe('play')
		expect(play.attr('aria-hidden')).toBe('true')
		expect(play.attr('focusable')).toBe('false')
		expect(play.attr('slot')).toBeUndefined()
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
