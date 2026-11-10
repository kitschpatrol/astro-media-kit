import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

describe('audio player server markup', () => {
	let readHTML: Awaited<ReturnType<typeof buildFixture>>['readHTML']
	let distribution: string
	beforeAll(async () => {
		;({ dist: distribution, readHTML } = await buildFixture('core-image'))
	})

	it('links the audio skin only from rendered audio players', async () => {
		const image = await readHTML('/carousel/')
		const imageLinks = image('link[rel="stylesheet"]')
			.map((_, link) => image(link).attr('href')!)
			.get()
		const styles = await Promise.all(
			imageLinks.map(async (href) => readFile(`${distribution}${href}`, 'utf8')),
		)
		expect(styles.join('\n')).not.toContain('.audio-controls-start')
		const audio = await readHTML('/audio-startup/')
		const links = audio('body link[rel="stylesheet"]')
			.map((_, link) => audio(link).attr('href')!)
			.get()
		expect(links).toHaveLength(2)
		expect(new Set(links).size).toBe(1)
		expect(await readFile(`${distribution}${links[0]!}`, 'utf8')).toContain('.audio-controls-start')
	})

	it('gives every audio instance independent menu, popover, and tooltip targets', async () => {
		const $ = await readHTML('/audio-startup/')
		const players = $('audio-player')
		expect(players).toHaveLength(2)
		const ids = $('audio-player [id]')
			.map((_, element) => $(element).attr('id')!)
			.get()
		expect(new Set(ids).size).toBe(ids.length)
		players.each((_, player) => {
			$(player)
				.find('[trigger], [commandfor]')
				.each((_controlIndex, control) => {
					const target = $(control).attr('trigger') ?? $(control).attr('commandfor')!
					expect($(player).find(`[id="${target}"]`)).toHaveLength(1)
				})
		})
	})
})
