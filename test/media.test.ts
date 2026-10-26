import { describe, expect, it } from 'vitest'
import {
	hasImageExtension,
	hasMediaExtension,
	isDirectMediaUrl,
	isLocalPath,
	tryParseUrl,
} from '../src/components/utils/media'

const url = (s: string) => new URL(s)

describe('tryParseUrl', () => {
	it('parses valid HTTP(S) URLs', () => {
		expect(tryParseUrl('https://example.com/path')).toBeInstanceOf(URL)
		expect(tryParseUrl('https://example.com')).toBeInstanceOf(URL)
		expect(tryParseUrl('https://example.com/path')?.hostname).toBe('example.com')
	})

	it('returns undefined for non-URLs', () => {
		for (const input of ['./local/path', '/absolute/path', 'just-a-string', '']) {
			expect(tryParseUrl(input)).toBeUndefined()
		}
	})

	it('returns undefined for non-HTTP protocols', () => {
		expect(tryParseUrl('ftp://example.com')).toBeUndefined()
		expect(tryParseUrl('file:///local/file')).toBeUndefined()
	})
})

describe('hasImageExtension', () => {
	it('recognizes image files by extension, in any case, before a query or fragment', () => {
		expect(hasImageExtension('../assets/photo.JPG')).toBe(true)
		expect(hasImageExtension('https://example.com/a.webp?w=1#top')).toBe(true)
		expect(hasImageExtension('/media/loop.mp4')).toBe(false)
		expect(hasImageExtension('https://example.com/photo')).toBe(false)
		expect(hasImageExtension('')).toBe(false)
	})
})

describe('hasMediaExtension', () => {
	it('recognizes media files by extension', () => {
		expect(hasMediaExtension('/media/loop.mp4')).toBe(true)
		expect(hasMediaExtension('stream.M3U8?token=1')).toBe(true)
		expect(hasMediaExtension('../assets/photo.jpg')).toBe(false)
	})
})

describe('isDirectMediaUrl', () => {
	it.each([
		'.mp4',
		'.webm',
		'.mov',
		'.mkv',
		'.mp3',
		'.ogg',
		'.wav',
		'.flac',
		'.opus',
		'.m4a',
		'.m3u8',
	])('recognizes %s as direct media', (extension) => {
		expect(isDirectMediaUrl(url(`https://example.com/file${extension}`))).toBe(true)
	})

	it('is case-insensitive', () => {
		expect(isDirectMediaUrl(url('https://example.com/video.MP4'))).toBe(true)
	})

	it.each(['.html', '.jpg', '.pdf'])('rejects %s', (extension) => {
		expect(isDirectMediaUrl(url(`https://example.com/file${extension}`))).toBe(false)
	})

	it('rejects URLs without extensions', () => {
		expect(isDirectMediaUrl(url('https://example.com/video'))).toBe(false)
		expect(isDirectMediaUrl(url('https://example.com/'))).toBe(false)
	})
})

describe('isLocalPath', () => {
	it.each(['./video.mp4', '../assets/audio.mp3', '/videos/clip.webm', 'video.mp4'])(
		'recognizes %s as local',
		(path) => {
			expect(isLocalPath(path)).toBe(true)
		},
	)

	it.each(['some-identifier', 'page.html', ''])('rejects %s', (path) => {
		expect(isLocalPath(path)).toBe(false)
	})
})
