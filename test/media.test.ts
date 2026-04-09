import { describe, expect, it } from 'vitest'
import { isDirectMediaUrl, isLocalPath, tryParseUrl } from '../src/components/utils/media'

describe('tryParseUrl', () => {
	it('parses valid HTTP URLs', () => {
		const url = tryParseUrl('https://example.com/path')
		expect(url).toBeInstanceOf(URL)
		expect(url?.hostname).toBe('example.com')
	})

	it('parses HTTP URLs', () => {
		const url = tryParseUrl('http://example.com')
		expect(url).toBeInstanceOf(URL)
	})

	it('returns undefined for non-URL strings', () => {
		expect(tryParseUrl('./local/path')).toBeUndefined()
		expect(tryParseUrl('/absolute/path')).toBeUndefined()
		expect(tryParseUrl('just-a-string')).toBeUndefined()
		expect(tryParseUrl('')).toBeUndefined()
	})

	it('returns undefined for non-HTTP protocols', () => {
		expect(tryParseUrl('ftp://example.com')).toBeUndefined()
		expect(tryParseUrl('file:///local/file')).toBeUndefined()
	})
})

describe('isDirectMediaUrl', () => {
	it('recognizes video extensions', () => {
		expect(isDirectMediaUrl(new URL('https://example.com/video.mp4'))).toBe(true)
		expect(isDirectMediaUrl(new URL('https://example.com/video.webm'))).toBe(true)
		expect(isDirectMediaUrl(new URL('https://example.com/video.mov'))).toBe(true)
		expect(isDirectMediaUrl(new URL('https://example.com/video.mkv'))).toBe(true)
	})

	it('recognizes audio extensions', () => {
		expect(isDirectMediaUrl(new URL('https://example.com/audio.mp3'))).toBe(true)
		expect(isDirectMediaUrl(new URL('https://example.com/audio.ogg'))).toBe(true)
		expect(isDirectMediaUrl(new URL('https://example.com/audio.wav'))).toBe(true)
		expect(isDirectMediaUrl(new URL('https://example.com/audio.flac'))).toBe(true)
		expect(isDirectMediaUrl(new URL('https://example.com/audio.opus'))).toBe(true)
		expect(isDirectMediaUrl(new URL('https://example.com/audio.m4a'))).toBe(true)
	})

	it('recognizes HLS manifest', () => {
		expect(isDirectMediaUrl(new URL('https://example.com/stream.m3u8'))).toBe(true)
	})

	it('is case-insensitive', () => {
		expect(isDirectMediaUrl(new URL('https://example.com/video.MP4'))).toBe(true)
		expect(isDirectMediaUrl(new URL('https://example.com/audio.WAV'))).toBe(true)
	})

	it('rejects non-media extensions', () => {
		expect(isDirectMediaUrl(new URL('https://example.com/page.html'))).toBe(false)
		expect(isDirectMediaUrl(new URL('https://example.com/image.jpg'))).toBe(false)
		expect(isDirectMediaUrl(new URL('https://example.com/doc.pdf'))).toBe(false)
	})

	it('rejects URLs without extensions', () => {
		expect(isDirectMediaUrl(new URL('https://example.com/video'))).toBe(false)
		expect(isDirectMediaUrl(new URL('https://example.com/'))).toBe(false)
	})
})

describe('isLocalPath', () => {
	it('recognizes relative paths', () => {
		expect(isLocalPath('./video.mp4')).toBe(true)
		expect(isLocalPath('../assets/audio.mp3')).toBe(true)
	})

	it('recognizes absolute paths', () => {
		expect(isLocalPath('/videos/clip.webm')).toBe(true)
	})

	it('recognizes paths with media extensions', () => {
		expect(isLocalPath('video.mp4')).toBe(true)
		expect(isLocalPath('audio.ogg')).toBe(true)
	})

	it('rejects non-media bare strings', () => {
		expect(isLocalPath('some-identifier')).toBe(false)
		expect(isLocalPath('page.html')).toBe(false)
	})

	it('rejects empty string', () => {
		expect(isLocalPath('')).toBe(false)
	})
})
