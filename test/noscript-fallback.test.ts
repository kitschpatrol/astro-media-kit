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
		expect(link.text().trim()).toBe('Watch on YouTube')
		expect(fallback('img').attr('alt')).toBe('YouTube video')
		expect(fallback('img').attr('src')).toBe('/media/loop-poster.jpg')
		expect(fallback('img').attr('style')).toBe(playerStyle)
		expect(fallback('video')).toHaveLength(0)
	})

	it('links a native-controls embed without a poster by its label alone', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		const fallback = fallbackOf($, '#vimeo-native')!
		expect(fallback('a').attr('href')).toBe('https://vimeo.com/76979871')
		expect(fallback('a').text().trim()).toBe('Watch on Vimeo')
		expect(fallback('img')).toHaveLength(0)
	})

	it('falls back from the audio skin to native controls with the same playback options', async () => {
		const $ = await fixture.readHTML('/noscript-fallback/')
		const audio = fallbackOf($, '#audio')?.('audio')
		expect(audio?.is('[controls]')).toBe(true)
		expect(audio?.is('[loop]')).toBe(true)
		expect(audio?.attr('preload')).toBe('none')
		expect(audio?.attr('src')).toBe('/media/loop.mp4')
		expect($('#audio audio-skin > audio').attr('src')).toBe('/media/loop.mp4')
	})
})
