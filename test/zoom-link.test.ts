import type { CheerioAPI } from 'cheerio'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

const assetPattern = /^\/_astro\//v

type Selection = ReturnType<CheerioAPI>

/** `Node.TEXT_NODE`, which Node.js has no `Node` for. */
const textNode = 3

/** The media in a link's template, which cheerio keeps in a fragment of its own. */
function templated($: CheerioAPI, link: Selection): Selection {
	return $(link.find('template')[0]?.children ?? [])
}

/** A link's own text, without that of the media in its template. */
function textOf($: CheerioAPI, link: Selection): string {
	return link
		.contents()
		.filter((_index, node) => node.nodeType === textNode)
		.map((_index, node) => $(node).text())
		.get()
		.join('')
		.trim()
}

describe('zoom link server markup', () => {
	let fixture: Awaited<ReturnType<typeof buildFixture>>
	beforeAll(async () => {
		fixture = await buildFixture('core-image')
	})

	it('links to the image, with the image itself in a template and the wrapper reduced to attributes', async () => {
		const $ = await fixture.readHTML('/zoom-link/')
		const links = $('#prose a.amk-zoom.amk-zoom-link')
		expect(links).toHaveLength(4)
		const photo = links.eq(0)
		expect(textOf($, photo)).toBe('a photo')
		expect(photo.attr('href')).toMatch(assetPattern)
		expect(photo.attr('data-gallery')).toBe('trip')
		expect(photo.attr('role')).toBeUndefined()
		expect(photo.attr('data-interactive')).toBeUndefined()
		expect(photo.find('template')).toHaveLength(1)
		const image = templated($, photo).find('img')
		expect(image).toHaveLength(1)
		expect(image.attr('alt')).toBe('a photo')
		expect(image.attr('slot')).toBeUndefined()
		expect(image.attr('src')).toBe(photo.attr('href'))
		expect(photo.attr('data-native-width')).toBe(image.attr('width'))
		expect(templated($, photo).find('.amk-zoom')).toHaveLength(0)
		expect(templated($, photo).find('script')).toHaveLength(0)
	})

	it('links to the video file, with the player in a template', async () => {
		const $ = await fixture.readHTML('/zoom-link/')
		const video = $('#prose a.amk-zoom.amk-zoom-link').eq(1)
		expect(textOf($, video)).toBe('a video')
		expect(video.attr('href')).toBe('/media/loop.mp4')
		expect(video.attr('data-interactive')).toBeUndefined()
		const player = templated($, video)
		expect(player.find('video-player')).toHaveLength(1)
		expect(player.find('media-container[data-media]')).toHaveLength(1)
		expect(player.find('video[data-src="/media/loop.mp4"]')).toHaveLength(1)
		expect(player.find('script')).toHaveLength(0)
	})

	it('takes the alt text and zoom level it is given', async () => {
		const $ = await fixture.readHTML('/zoom-link/')
		const tile = $('#prose a.amk-zoom.amk-zoom-link').eq(2)
		expect(templated($, tile).find('img').attr('alt')).toBe('A tile')
		expect(tile.attr('data-level')).toBe('native')
		expect(tile.attr('data-gallery')).toBeUndefined()
	})

	it('keeps the scripts the media emits in the page, outside the template', async () => {
		const $ = await fixture.readHTML('/zoom-link/')
		expect($('#prose script')).not.toHaveLength(0)
	})

	it('keeps the scripts of a link in a caption, which renders its content once', async () => {
		const $ = await fixture.readHTML('/caption-script/')
		const caption = $('figcaption .caption')
		expect(caption.find('a.amk-zoom.amk-zoom-link')).toHaveLength(1)
		expect(caption.text()).toContain('A caption with')
		expect($('script[src*="Zoomer"]')).toHaveLength(1)
	})

	it('keeps text that reads as a character reference in a templated attribute as written', async () => {
		const $ = await fixture.readHTML('/entities/')
		const link = $('#link a.amk-zoom.amk-zoom-link')
		expect(templated($, link).find('img').attr('alt')).toBe('&copy; as written')
	})

	it('gives a player wrapper its fallback as data-href rather than a link', async () => {
		const $ = await fixture.readHTML('/zoom/')
		const wrapper = $('#video .amk-zoom')
		expect(wrapper.is('div')).toBe(true)
		expect(wrapper.attr('href')).toBeUndefined()
		expect(wrapper.attr('data-href')).toBe('/media/loop.mp4')
	})
})
