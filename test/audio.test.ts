import { describe, expect, it } from 'vitest'
import {
	buildSoundCloudEmbedUrl,
	resolveAudioSource,
	soundcloudIsValidMediaId,
} from '../src/components/utils/audio'

describe('soundcloudIsValidMediaId', () => {
	it('accepts numeric IDs', () => {
		expect(soundcloudIsValidMediaId('123456789')).toBe(true)
		expect(soundcloudIsValidMediaId('1')).toBe(true)
	})

	it('rejects non-numeric strings', () => {
		for (const input of ['abc', '', '123abc', '12.34']) {
			expect(soundcloudIsValidMediaId(input)).toBe(false)
		}
	})
})

describe('resolveAudioSource', () => {
	describe('URL inference', () => {
		it.each(['soundcloud.com', 'm.soundcloud.com', 'www.soundcloud.com'])(
			'resolves %s URL as soundcloud',
			(host) => {
				const src = `https://${host}/artist/track`
				expect(resolveAudioSource(src)).toEqual({ identifier: src, service: 'soundcloud' })
			},
		)

		it('resolves direct media URL as local', () => {
			expect(resolveAudioSource('https://example.com/song.mp3')).toEqual({
				identifier: 'https://example.com/song.mp3',
				service: 'local',
			})
		})

		it('resolves unknown page URL as oembed', () => {
			expect(resolveAudioSource('https://open.spotify.com/track/abc123')).toEqual({
				identifier: 'https://open.spotify.com/track/abc123',
				service: 'oembed',
			})
		})
	})

	describe('raw ID inference', () => {
		it('infers soundcloud from numeric ID', () => {
			expect(resolveAudioSource('123456789')).toEqual({
				identifier: '123456789',
				service: 'soundcloud',
			})
		})

		it.each(['./audio/file.mp3', '/sounds/beep.wav', 'my-audio-file'])(
			'assumes local for %s',
			(src) => {
				expect(resolveAudioSource(src)).toEqual({ identifier: src, service: 'local' })
			},
		)
	})

	describe('explicit service override', () => {
		it('overrides inferred service', () => {
			expect(resolveAudioSource('123456789', 'local')).toEqual({
				identifier: '123456789',
				service: 'local',
			})
		})

		it('overrides URL-inferred service', () => {
			expect(resolveAudioSource('https://soundcloud.com/artist/track', 'oembed')).toEqual({
				identifier: 'https://soundcloud.com/artist/track',
				service: 'oembed',
			})
		})
	})
})

describe('buildSoundCloudEmbedUrl', () => {
	it('builds URL from numeric track ID', () => {
		const url = buildSoundCloudEmbedUrl('123456', { autoPlay: false })
		expect(url).toContain('https://w.soundcloud.com/player/')
		expect(url).toContain('url=')
		expect(url).toContain('auto_play=false')
	})

	it('passes through full SoundCloud URLs', () => {
		const url = buildSoundCloudEmbedUrl('https://soundcloud.com/artist/track', { autoPlay: true })
		expect(url).toContain('soundcloud.com')
		expect(url).toContain('auto_play=true')
	})

	it('includes expected default parameters', () => {
		const url = buildSoundCloudEmbedUrl('123', { autoPlay: false })
		for (const param of [
			'hide_related=false',
			'show_comments=false',
			'show_reposts=false',
			'show_teaser=false',
			'show_user=true',
		]) {
			expect(url).toContain(param)
		}
	})
})
