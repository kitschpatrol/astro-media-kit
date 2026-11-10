import { load } from 'cheerio'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { fillLabel, labelNames } from '../src/components/internal/labels'
import { viewerMarkup } from '../src/components/internal/lightbox/chrome'
import { mediaIconNames } from '../src/components/media-icon-names'
import { resolveIcons, resolveLabels, viewerIcons, viewerLabels } from '../src/integration/theme'
import { buildFixture } from './parity/helpers/build-fixture'

const fixtureRoot = new URL('parity/fixtures/theme/', import.meta.url)
const missingIconError = /Could not read the "play" icon from ".*missing\.svg"/v
const iconMarker = /data-custom-icon=\\?["'](?<name>[\w\-]+)/gv

describe('resolveIcons', () => {
	it('takes markup, a path from the project root, and a URL', () => {
		const { files, icons } = resolveIcons(
			{
				close: './src/icons/close.svg',
				expand: new URL('src/icons/expand.svg', fixtureRoot),
				play: '  <svg viewBox="0 0 24 24"><path d="m8 4 12 8-12 8Z" /></svg>',
			},
			fixtureRoot,
		)
		expect(new Set(Object.keys(icons))).toEqual(new Set(['close', 'expand', 'play']))
		expect(load(icons.close!)('svg').attr('data-custom-icon')).toBe('close')
		expect(load(icons.expand!)('svg').attr('data-custom-icon')).toBe('expand')
		expect(load(icons.play!)('path').attr('d')).toBe('m8 4 12 8-12 8Z')
		// Only files are watched for changes
		expect(files).toEqual([
			fileURLToPath(new URL('src/icons/close.svg', fixtureRoot)),
			fileURLToPath(new URL('src/icons/expand.svg', fixtureRoot)),
		])
	})

	it('takes an absolute path as it is', () => {
		const file = fileURLToPath(new URL('src/icons/close.svg', fixtureRoot))
		const { files } = resolveIcons({ close: file }, pathToFileURL('/somewhere/else/'))
		expect(files).toEqual([file])
	})

	it('keeps the artwork and makes it decorative, leaving out a prolog and comments', () => {
		const { icons } = resolveIcons(
			{
				play: `<?xml version="1.0" encoding="UTF-8"?>
				<!-- Before -->
				<svg aria-hidden="false" focusable="true" class="custom" viewBox="0 0 32 32" fill="none">
					<title>Play &amp; pause</title><path d="M4 4 28 16 4 28Z" stroke="currentColor" data-note="a &amp; b" />
				</svg>
				<!-- After -->`,
			},
			fixtureRoot,
		)
		const $ = load(icons.play!)
		const svg = $('svg')
		expect(icons.play!.startsWith('<svg')).toBe(true)
		expect(icons.play!.endsWith('</svg>')).toBe(true)
		expect(svg.attr('aria-hidden')).toBe('true')
		expect(svg.attr('focusable')).toBe('false')
		expect(svg.attr('class')).toBe('custom')
		expect(svg.attr('viewBox')).toBe('0 0 32 32')
		expect($('path').attr('stroke')).toBe('currentColor')
		expect($('path').attr('data-note')).toBe('a & b')
		expect($('title').text()).toBe('Play & pause')
	})

	it('names the icons there are when given one there is not', () => {
		expect(() => resolveIcons({ rewind: '<svg />' } as never, fixtureRoot)).toThrow(
			`Unknown icon "rewind" in the icons option. The icons are: ${mediaIconNames.join(', ')}.`,
		)
	})

	it.each(['<span><svg /></span>', '<svg /><svg />', '<svg /> Caption', '<p>Caption</p>'])(
		'refuses markup that is not exactly one SVG: %s',
		(markup) => {
			expect(() => resolveIcons({ play: markup }, fixtureRoot)).toThrow(
				'The "play" icon must be exactly one SVG element.',
			)
		},
	)

	it('says which icon and file could not be read', () => {
		expect(() => resolveIcons({ play: './src/icons/missing.svg' }, fixtureRoot)).toThrow(
			missingIconError,
		)
	})

	it('hands the lightbox script only the icons on its own buttons', () => {
		const svg = '<svg></svg>'
		expect(viewerIcons({ close: svg, expand: svg, next: svg, play: svg, 'zoom-in': svg })).toEqual({
			close: svg,
			next: svg,
			'zoom-in': svg,
		})
	})
})

describe('resolveLabels', () => {
	it('takes the labels as given', () => {
		expect(resolveLabels({ close: 'Shut', slide: '{index} von {count}' })).toEqual({
			close: 'Shut',
			slide: '{index} von {count}',
		})
		expect(resolveLabels({})).toEqual({})
	})

	it('names the labels there are when given one there is not', () => {
		expect(() => resolveLabels({ shut: 'Shut' } as never)).toThrow(
			`Unknown label "shut" in the labels option. The labels are: ${labelNames.join(', ')}.`,
		)
	})

	it.each([42, '', ' ', undefined])('refuses a label that is not text: %s', (label) => {
		expect(() => resolveLabels({ close: label } as never)).toThrow(
			'The "close" label must be text.',
		)
	})

	it('hands the lightbox script only the labels it puts on its own controls', () => {
		expect(
			viewerLabels({ close: 'a', goToSlide: 'b', playbackControls: 'c', slide: 'd', viewer: 'e' }),
		).toEqual({ close: 'a', slide: 'd', viewer: 'e' })
	})
})

describe('fillLabel', () => {
	it('puts each value in place of its name in braces', () => {
		expect(fillLabel('{index} of {count}', { count: 3, index: 1 })).toBe('1 of 3')
		expect(fillLabel('Picture {index} out of {count} ({index})', { count: 3, index: 2 })).toBe(
			'Picture 2 out of 3 (2)',
		)
		expect(fillLabel('Watch on {service}', { service: 'YouTube' })).toBe('Watch on YouTube')
	})

	it('leaves a label without placeholders, and a placeholder without a value, as written', () => {
		expect(fillLabel('Onward', { index: 1 })).toBe('Onward')
		expect(fillLabel('{index} of {total}', { index: 1 })).toBe('1 of {total}')
	})
})

describe('viewerMarkup', () => {
	it('puts the configured labels on the dialog and its buttons, escaped, and English on the rest', () => {
		const $ = load(viewerMarkup({ labels: { close: 'Shut', viewer: 'Media "viewing" & more' } }))
		expect($('dialog').attr('aria-label')).toBe('Media "viewing" & more')
		expect($('.amk-lightbox-close').attr('aria-label')).toBe('Shut')
		expect($('.amk-lightbox-next').attr('aria-label')).toBe('Next')
		expect($('.amk-lightbox-previous').attr('aria-label')).toBe('Previous')
		expect($('.amk-lightbox-zoom').attr('aria-label')).toBe('Zoom')
		expect($('.amk-lightbox-track').attr('aria-label')).toBe('Gallery')
		expect($('.amk-lightbox-track').attr('aria-roledescription')).toBe('carousel')
	})

	it('draws the configured icons, and the built-in artwork for the rest', () => {
		const $ = load(viewerMarkup({ icons: { close: '<svg data-custom-icon="close"></svg>' } }))
		expect($('.amk-lightbox-close [data-amk-icon="close"] svg').attr('data-custom-icon')).toBe(
			'close',
		)
		for (const name of ['previous', 'next', 'zoom-in', 'zoom-out']) {
			const svg = $(`[data-amk-icon="${name}"] svg`)
			expect(svg).toHaveLength(1)
			expect(svg.attr('data-custom-icon')).toBeUndefined()
			expect(svg.attr('aria-hidden')).toBe('true')
		}
	})
})

describe('icons configured through the integration', () => {
	let fixture: Awaited<ReturnType<typeof buildFixture>>
	beforeAll(async () => {
		fixture = await buildFixture('theme')
	})

	it('draws them into the page wherever the kit shows that icon', async () => {
		const $ = await fixture.readHTML('/')
		expect($('#indicator .amk-zoom-indicator svg').attr('data-custom-icon')).toBe('expand')
		expect($('#video [data-zoom-open] .amk-icon svg').attr('data-custom-icon')).toBe('expand')
		expect($('#carousel .amk-carousel-next svg').attr('data-custom-icon')).toBe('next')
		expect($('#video media-play-button .amk-icon-play svg').attr('data-custom-icon')).toBe('play')
		expect(
			$('#audio media-play-button .media-play-button-play-icon svg').attr('data-custom-icon'),
		).toBe('play')
		for (const svg of $('[data-amk-icon] > svg[data-custom-icon]')) {
			expect($(svg).attr('aria-hidden')).toBe('true')
		}
	})

	it('keeps the built-in artwork for the icons left out', async () => {
		const $ = await fixture.readHTML('/')
		for (const selector of [
			'#carousel .amk-carousel-previous svg',
			'#video media-play-button .amk-icon-pause svg',
			'#video amk-mute-button .amk-icon-volume-high svg',
			'#audio media-seek-button .amk-icon svg',
		]) {
			expect($(selector).length).toBeGreaterThan(0)
			expect($(selector).attr('data-custom-icon')).toBeUndefined()
		}
	})

	it('leaves an indicator its own slotted artwork', async () => {
		const $ = await fixture.readHTML('/')
		const indicator = $('#local-indicator .amk-zoom-indicator')
		expect(indicator.find('svg').attr('data-custom-icon')).toBe('local-indicator')
		expect(indicator.attr('data-amk-icon')).toBeUndefined()
	})

	it('draws every icon as markup, with nothing left for a script to fill in', async () => {
		const $ = await fixture.readHTML('/')
		expect($('media-icon')).toHaveLength(0)
		expect($('template[data-amk-media-theme]')).toHaveLength(0)
		const icons = $('.amk-icon')
		expect(icons.length).toBeGreaterThan(10)
		for (const icon of icons) {
			expect($(icon).children('svg')).toHaveLength(1)
		}
	})

	it('puts the configured labels on the controls the templates render', async () => {
		const $ = await fixture.readHTML('/')
		expect($('#carousel .amk-carousel-next').attr('aria-label')).toBe('Onward')
		expect($('#carousel .amk-carousel-previous').attr('aria-label')).toBe('Previous')
		const slides = $('#carousel .amk-carousel-slide')
		expect(slides.eq(0).attr('aria-label')).toBe('Picture 1 out of 2')
		expect(slides.eq(1).attr('aria-label')).toBe('Picture 2 out of 2')
		expect($('#carousel .amk-carousel-dot').eq(1).attr('aria-label')).toBe('Picture 2')
		expect($('#video media-controls-group').attr('aria-label')).toBe('Playing controls')
		// Left out of the configuration, so in English
		expect($('#video [data-zoom-open]').attr('aria-label')).toBe('Expand video')
		expect($('#carousel .amk-carousel').attr('aria-label')).toBe('Carousel')
	})

	it("builds the viewer's labels into the lightbox script, and no others", async () => {
		const directory = path.join(fixture.dist, '_astro')
		const names = await readdir(directory)
		const scripts = await Promise.all(
			names
				.filter((name) => name.endsWith('.js'))
				.map(async (name) => readFile(path.join(directory, name), 'utf8')),
		)
		const bundle = scripts.join('\n')
		expect(bundle).toContain('Shut')
		expect(bundle).toContain('Picture {index} out of {count}')
		expect(bundle).not.toContain('Playing controls')
		expect(bundle).not.toContain('Picture {index}"')
	})

	it("builds the viewer's icons into the lightbox script, and no others", async () => {
		const directory = path.join(fixture.dist, '_astro')
		const names = await readdir(directory)
		const scripts = await Promise.all(
			names
				.filter((name) => name.endsWith('.js'))
				.map(async (name) => readFile(path.join(directory, name), 'utf8')),
		)
		const markers = scripts
			.join('\n')
			.matchAll(iconMarker)
			.map((match) => match.groups!.name)
		expect(new Set(markers)).toEqual(new Set(['close', 'next']))
	})
})

describe('icons without the integration', () => {
	it('are the built-in artwork, drawn into the page all the same', async () => {
		const fixture = await buildFixture('core-image')
		const $ = await fixture.readHTML('/zoom/')
		expect($('media-icon')).toHaveLength(0)
		expect($('#video media-play-button .amk-icon-play svg')).toHaveLength(1)
		expect($('#video [data-zoom-open] .amk-icon svg')).toHaveLength(1)
		expect($('[data-custom-icon]')).toHaveLength(0)
	})
})
