import type { CheerioAPI } from 'cheerio'
import { load } from 'cheerio'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

const playerStyle = 'width: 640px; aspect-ratio: 16 / 9'

/**
 * The fallback a section renders for browsers without JavaScript, parsed the
 * way such a browser would: cheerio keeps `<noscript>` content as raw text.
 */
function fallbackOf($: CheerioAPI, section: string): CheerioAPI | undefined {
	const noscript = $(`${section} .amk > noscript`)
	return noscript.length === 0 ? undefined : load(noscript.text())
}

describe('noscript fallback server markup', () => {
	let fixture: Awaited<ReturnType<typeof buildFixture>>
	beforeAll(async () => {
		fixture = await buildFixture('core-image')
	})

	it('falls back to a native video at the player size for a local file', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		const video = fallbackOf($, '#local')?.('video')
		expect(video?.is('[controls]')).toBe(true)
		expect(video?.attr('style')).toBe(playerStyle)
		expect(video?.find('source').attr('src')).toBe('/media/loop.mp4')
	})

	it('adds no fallback where native controls already play the file', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		expect($('#local-native video[src="/media/loop.mp4"]')).toHaveLength(1)
		expect(fallbackOf($, '#local-native')).toBeUndefined()
	})

	it('falls back from a native-controls HLS element to its stream and MP4', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		const fallback = fallbackOf($, '#hls-native')!
		expect(fallback('video').attr('style')).toBe(playerStyle)
		expect(
			fallback('video source')
				.map((_index, source) => fallback(source).attr('src'))
				.get(),
		).toEqual(['/hls/stream.m3u8', '/media/loop.mp4'])
	})

	it('links a service embed to its page, over the poster at the player size', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		const fallback = fallbackOf($, '#youtube')!
		const link = fallback('a')
		expect(link.attr('href')).toBe('https://www.youtube.com/watch?v=aqz-KE-bpKQ')
		expect(link.attr('style')).toBe(playerStyle)
		expect(link.text().trim()).toBe('Watch on YouTube')
		expect(fallback('img').attr('alt')).toBe('YouTube video')
		expect(fallback('img').attr('src')).toBe('/media/loop-poster.jpg')
		expect(fallback('video')).toHaveLength(0)
	})

	it('links a native-controls embed without a poster by its label, at the player size', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		const fallback = fallbackOf($, '#vimeo-native')!
		expect(fallback('a').attr('href')).toBe('https://vimeo.com/76979871')
		expect(fallback('a').attr('style')).toBe(playerStyle)
		expect(fallback('a').text().trim()).toBe('Watch on Vimeo')
		expect(fallback('img')).toHaveLength(0)
	})

	it('scales an oEmbed video to its ratio, and links to its page over the poster at that ratio', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		const wrapper = $('#oembed-video .amk-oembed')
		expect(wrapper.is('[data-scaled]')).toBe(true)
		expect(wrapper.attr('style')).toBe('aspect-ratio: 854 / 480')
		const fallback = fallbackOf($, '#oembed-video')!
		expect(fallback('a').attr('href')).toBe('https://www.ted.com/talks/a_talk')
		expect(fallback('a').attr('style')).toBe('width: 100%; aspect-ratio: 854 / 480')
		expect(fallback('a').text().trim()).toBe('Watch on TED')
		expect(fallback('img').attr('alt')).toBe('A talk')
		expect(fallback('img').attr('src')).toBe('/media/loop-poster.jpg')
	})

	it('keeps an oEmbed without a ratio at its own size, linking by its label alone', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		const wrapper = $('#oembed-audio .amk-oembed')
		expect(wrapper.is('[data-scaled]')).toBe(false)
		expect(wrapper.attr('style')).toBeUndefined()
		const fallback = fallbackOf($, '#oembed-audio')!
		expect(fallback('a').attr('href')).toBe('https://open.spotify.com/track/a_track')
		expect(fallback('a').attr('style')).toBeUndefined()
		expect(fallback('a').text().trim()).toBe('Listen on Spotify')
		expect(fallback('img')).toHaveLength(0)
	})

	it('links a SoundCloud track URL to itself, and a bare track ID to the player page', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		const byUrl = fallbackOf($, '#soundcloud-url')!('a')
		expect(byUrl.attr('href')).toBe('https://soundcloud.com/kitschpatrol/drona')
		expect(byUrl.text().trim()).toBe('Listen on SoundCloud')
		const byId = fallbackOf($, '#soundcloud-id')!('a')
		expect(byId.attr('href')).toBe($('#soundcloud-id iframe').attr('src'))
		expect(byId.attr('href')).toContain('https://w.soundcloud.com/player/?')
	})

	it('falls back from the audio skin to native controls with the same playback options', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		const audio = fallbackOf($, '#audio')?.('audio')
		expect(audio?.is('[controls]')).toBe(true)
		expect(audio?.is('[loop]')).toBe(true)
		expect(audio?.attr('preload')).toBe('none')
		expect(audio?.attr('src')).toBe('/media/loop.mp4')
		expect($('#audio audio-player > media-container > audio').attr('src')).toBe('/media/loop.mp4')
	})
})
