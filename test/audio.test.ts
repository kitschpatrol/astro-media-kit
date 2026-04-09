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
		expect(soundcloudIsValidMediaId('abc')).toBe(false)
		expect(soundcloudIsValidMediaId('')).toBe(false)
		expect(soundcloudIsValidMediaId('123abc')).toBe(false)
		expect(soundcloudIsValidMediaId('12.34')).toBe(false)
	})
})

describe('resolveAudioSource', () => {
	describe('URL inference', () => {
		it('resolves SoundCloud URL', () => {
			expect(resolveAudioSource('https://soundcloud.com/artist/track')).toEqual({
				identifier: 'https://soundcloud.com/artist/track',
				service: 'soundcloud',
			})
		})

		it('resolves mobile SoundCloud URL', () => {
			expect(resolveAudioSource('https://m.soundcloud.com/artist/track')).toEqual({
				identifier: 'https://m.soundcloud.com/artist/track',
				service: 'soundcloud',
			})
		})

		it('resolves www SoundCloud URL', () => {
			expect(resolveAudioSource('https://www.soundcloud.com/artist/track')).toEqual({
				identifier: 'https://www.soundcloud.com/artist/track',
				service: 'soundcloud',
			})
		})

		it('resolves direct media URL as local', () => {
			expect(resolveAudioSource('https://example.com/song.mp3')).toEqual({
				identifier: 'https://example.com/song.mp3',
				service: 'local',
			})
		})

		it('resolves direct .ogg URL as local', () => {
			expect(resolveAudioSource('https://example.com/audio.ogg')).toEqual({
				identifier: 'https://example.com/audio.ogg',
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

		it('assumes local for non-URL non-ID strings', () => {
			expect(resolveAudioSource('./audio/file.mp3')).toEqual({
				identifier: './audio/file.mp3',
				service: 'local',
			})
		})

		it('assumes local for absolute paths', () => {
			expect(resolveAudioSource('/sounds/beep.wav')).toEqual({
				identifier: '/sounds/beep.wav',
				service: 'local',
			})
		})

		it('assumes local for unrecognized bare strings', () => {
			expect(resolveAudioSource('my-audio-file')).toEqual({
				identifier: 'my-audio-file',
				service: 'local',
			})
		})
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

	it('builds URL from full SoundCloud URL', () => {
		const url = buildSoundCloudEmbedUrl('https://soundcloud.com/artist/track', { autoPlay: true })
		expect(url).toContain('soundcloud.com')
		expect(url).toContain('auto_play=true')
	})

	it('includes expected default parameters', () => {
		const url = buildSoundCloudEmbedUrl('123', { autoPlay: false })
		expect(url).toContain('hide_related=false')
		expect(url).toContain('show_comments=false')
		expect(url).toContain('show_reposts=false')
		expect(url).toContain('show_teaser=false')
		expect(url).toContain('show_user=true')
	})
})
