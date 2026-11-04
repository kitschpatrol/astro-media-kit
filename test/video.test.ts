import nodePath from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bunnyIsValidMediaId } from '../src/components/utils/bunny'
import { cloudflareIsValidMediaId } from '../src/components/utils/cloudflare'
import { muxIsValidMediaId } from '../src/components/utils/mux'
import {
	getVideoInfo,
	isVideoSource,
	localVideoProbeCandidates,
	resolveVideoSource,
	validateServiceConfig,
} from '../src/components/utils/video'

const localOnlyConfig = {
	bunny: { apiAccessKey: '', hostname: '', libraryId: '' },
	cloudflare: { accountId: '', apiToken: '' },
	local: {},
	mux: { accessToken: '', secret: '' },
	oembed: {},
	vimeo: {},
	youtube: {},
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('localVideoProbeCandidates', () => {
	it('tries the public directory before the raw path for site-root-relative sources', () => {
		expect(localVideoProbeCandidates('/videos/intro.mp4')).toEqual([
			nodePath.posix.join(process.cwd().replaceAll('\\', '/'), 'public/videos/intro.mp4'),
			'/videos/intro.mp4',
		])
	})

	it('probes remote direct URLs and relative paths as-is', () => {
		expect(localVideoProbeCandidates('https://cdn.example/clip.mp4')).toEqual([
			'https://cdn.example/clip.mp4',
		])
		expect(localVideoProbeCandidates('./clip.mp4')).toEqual(['./clip.mp4'])
	})
})

describe('local video dimensions', () => {
	it('probes a site-root-relative source from the public directory', async () => {
		vi.spyOn(process, 'cwd').mockReturnValue(nodePath.join(import.meta.dirname, '../playground'))
		const info = await getVideoInfo('/test.mp4', 'local', localOnlyConfig, '/poster.jpg')
		expect(info.width).toBeGreaterThan(0)
		expect(info.height).toBeGreaterThan(0)
		expect(info.duration).toBeGreaterThan(0)
		expect(info.posterUrl).toBe('/poster.jpg')
	})

	it('falls back to zero dimensions when nothing resolves', async () => {
		const info = await getVideoInfo('/missing.mp4', 'local', localOnlyConfig, '')
		expect(info.width).toBe(0)
		expect(info.height).toBe(0)
		expect(info.duration).toBe(-1)
	})
})

describe('media ID validation', () => {
	describe('bunnyIsValidMediaId', () => {
		it('accepts valid Bunny UUID', () => {
			expect(bunnyIsValidMediaId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true)
		})

		it('rejects non-UUID strings', () => {
			expect(bunnyIsValidMediaId('not-a-uuid')).toBe(false)
			expect(bunnyIsValidMediaId('')).toBe(false)
		})
	})

	describe('cloudflareIsValidMediaId', () => {
		it('accepts valid 32-char hex string', () => {
			expect(cloudflareIsValidMediaId('81841bee83618bdde9278ab586e3568b')).toBe(true)
		})

		it('rejects non-hex or wrong-length strings', () => {
			expect(cloudflareIsValidMediaId('too-short')).toBe(false)
			expect(cloudflareIsValidMediaId('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false)
		})
	})

	describe('muxIsValidMediaId', () => {
		it('accepts valid 44-char alphanumeric string', () => {
			expect(muxIsValidMediaId('a'.repeat(44))).toBe(true)
			expect(muxIsValidMediaId('abcdefghijklmnopqrstuvwxyz012345678901234567')).toBe(true)
		})

		it('rejects wrong-length strings', () => {
			expect(muxIsValidMediaId('too-short')).toBe(false)
			expect(muxIsValidMediaId('a'.repeat(43))).toBe(false)
			expect(muxIsValidMediaId('a'.repeat(45))).toBe(false)
		})
	})
})

describe('isVideoSource', () => {
	it('takes service URLs and IDs, pages to embed, and media files for videos', () => {
		const missed = [
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
			'https://vimeo.com/123456789',
			'https://example.com/talk',
			'https://example.com/clip.mp4',
			'f24d7806-2cf5-4df9-a340-840d68eef8c9',
			'dQw4w9WgXcQ',
			'/media/loop.mp4',
			'../assets/clip.webm',
			'clip.m3u8',
		].filter((src) => !isVideoSource(src))
		expect(missed).toEqual([])
	})

	it('leaves image files, wherever they are, and other paths to the image pipeline', () => {
		const taken = [
			'../assets/photo.jpg',
			'/images/photo.webp?width=400',
			'https://example.com/photo.png#top',
			'../assets/drawing.tldr',
			'~aphex/Album/Photo',
			'./photo',
		].filter((src) => isVideoSource(src))
		expect(taken).toEqual([])
	})
})

describe('resolveVideoSource', () => {
	describe('raw ID inference', () => {
		it('infers bunny from UUID format', () => {
			expect(resolveVideoSource('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toEqual({
				identifier: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
				service: 'bunny',
			})
		})

		it('infers cloudflare from 32-char hex', () => {
			expect(resolveVideoSource('81841bee83618bdde9278ab586e3568b')).toEqual({
				identifier: '81841bee83618bdde9278ab586e3568b',
				service: 'cloudflare',
			})
		})

		it('infers mux from 44-char alphanumeric', () => {
			const id = 'a'.repeat(44)
			expect(resolveVideoSource(id)).toEqual({
				identifier: id,
				service: 'mux',
			})
		})

		it('infers youtube from 11-char ID', () => {
			expect(resolveVideoSource('dQw4w9WgXcQ')).toEqual({
				identifier: 'dQw4w9WgXcQ',
				service: 'youtube',
			})
		})

		it('infers vimeo from numeric ID', () => {
			expect(resolveVideoSource('10184668')).toEqual({
				identifier: '10184668',
				service: 'vimeo',
			})
		})

		it('throws for unrecognized format', () => {
			expect(() => resolveVideoSource('unknown-format')).toThrow('Could not infer video service')
		})
	})

	describe('URL extraction', () => {
		it.each([
			'https://www.youtube.com/embed/dQw4w9WgXcQextra',
			'https://www.youtube.com/shorts/dQw4w9WgXcQextra',
			'https://player.vimeo.com/video/10184668extra',
		])('does not truncate an invalid video ID in %s', (src) => {
			expect(resolveVideoSource(src)).toEqual({ identifier: src, service: 'oembed' })
		})

		it('extracts YouTube ID from watch URL', () => {
			expect(resolveVideoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
				identifier: 'dQw4w9WgXcQ',
				service: 'youtube',
			})
		})

		it('extracts YouTube ID from short URL', () => {
			expect(resolveVideoSource('https://youtu.be/dQw4w9WgXcQ')).toEqual({
				identifier: 'dQw4w9WgXcQ',
				service: 'youtube',
			})
		})

		it('extracts YouTube ID from embed URL', () => {
			expect(resolveVideoSource('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual({
				identifier: 'dQw4w9WgXcQ',
				service: 'youtube',
			})
		})

		it('extracts YouTube ID from shorts URL', () => {
			expect(resolveVideoSource('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
				identifier: 'dQw4w9WgXcQ',
				service: 'youtube',
			})
		})

		it('extracts Vimeo ID from standard URL', () => {
			expect(resolveVideoSource('https://vimeo.com/10184668')).toEqual({
				identifier: '10184668',
				service: 'vimeo',
			})
		})

		it('extracts Vimeo ID from player URL', () => {
			expect(resolveVideoSource('https://player.vimeo.com/video/10184668')).toEqual({
				identifier: '10184668',
				service: 'vimeo',
			})
		})

		it.each([
			'https://vimeo.com/10184668/abcdef0123',
			'https://vimeo.com/10184668?h=abcdef0123',
			'https://player.vimeo.com/video/10184668?h=abcdef0123',
		])('keeps the hash of an unlisted Vimeo video in %s', (src) => {
			expect(resolveVideoSource(src)).toEqual({
				identifier: '10184668/abcdef0123',
				service: 'vimeo',
			})
		})

		it.each([
			'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
			'https://youtube-nocookie.com/embed/dQw4w9WgXcQ',
			'https://www.youtube.com/watch/?v=dQw4w9WgXcQ',
		])('extracts the YouTube ID from %s', (src) => {
			expect(resolveVideoSource(src)).toEqual({
				identifier: 'dQw4w9WgXcQ',
				service: 'youtube',
			})
		})

		it('resolves direct media URL as local', () => {
			expect(resolveVideoSource('https://example.com/video.mp4')).toEqual({
				identifier: 'https://example.com/video.mp4',
				service: 'local',
			})
		})

		it('resolves local file path as local', () => {
			expect(resolveVideoSource('/test.mp4')).toEqual({
				identifier: '/test.mp4',
				service: 'local',
			})
		})

		it('resolves relative file path as local', () => {
			expect(resolveVideoSource('./assets/video.webm')).toEqual({
				identifier: './assets/video.webm',
				service: 'local',
			})
		})

		it('resolves unknown page URL as oembed', () => {
			expect(resolveVideoSource('https://www.dailymotion.com/video/x8abc12')).toEqual({
				identifier: 'https://www.dailymotion.com/video/x8abc12',
				service: 'oembed',
			})
		})
	})

	describe('explicit service override', () => {
		it.each([
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30',
			'https://youtu.be/dQw4w9WgXcQ',
			'https://vimeo.com/10184668#t=30s',
			'https://player.vimeo.com/video/10184668',
		])('preserves the complete page URL for explicit oEmbed discovery: %s', (src) => {
			expect(resolveVideoSource(src, 'oembed')).toEqual({ identifier: src, service: 'oembed' })
		})

		it('overrides inferred service', () => {
			expect(resolveVideoSource('dQw4w9WgXcQ', 'bunny')).toEqual({
				identifier: 'dQw4w9WgXcQ',
				service: 'bunny',
			})
		})

		it('allows bunny title search with explicit service', () => {
			expect(resolveVideoSource('My Video Title', 'bunny')).toEqual({
				identifier: 'My Video Title',
				service: 'bunny',
			})
		})

		it('overrides URL-inferred service but still extracts ID', () => {
			expect(resolveVideoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'vimeo')).toEqual({
				identifier: 'dQw4w9WgXcQ',
				service: 'vimeo',
			})
		})
	})
})

describe('validateServiceConfig', () => {
	const emptyConfig = {
		bunny: { apiAccessKey: '', hostname: '', libraryId: '' },
		cloudflare: { accountId: '', apiToken: '' },
		local: {},
		mux: { accessToken: '', secret: '' },
		oembed: {},
		vimeo: {},
		youtube: {},
	}

	it('throws for missing Bunny credentials', () => {
		expect(() => {
			validateServiceConfig('bunny', emptyConfig)
		}).toThrow('BUNNY_API_ACCESS_KEY')
	})

	it('throws for missing Cloudflare credentials', () => {
		expect(() => {
			validateServiceConfig('cloudflare', emptyConfig)
		}).toThrow('CLOUDFLARE_STREAM_ACCOUNT_ID')
	})

	it('throws for missing Mux credentials', () => {
		expect(() => {
			validateServiceConfig('mux', emptyConfig)
		}).toThrow('MUX_TOKEN_ID')
	})

	it('does not throw when credentials are present', () => {
		const validConfig = {
			bunny: { apiAccessKey: 'key', hostname: 'host', libraryId: 'lib' },
			cloudflare: { accountId: 'acc', apiToken: 'tok' },
			local: {},
			mux: { accessToken: 'tok', secret: 'sec' },
			oembed: {},
			vimeo: {},
			youtube: {},
		}

		expect(() => {
			validateServiceConfig('bunny', validConfig)
		}).not.toThrow()
		expect(() => {
			validateServiceConfig('cloudflare', validConfig)
		}).not.toThrow()
		expect(() => {
			validateServiceConfig('mux', validConfig)
		}).not.toThrow()
	})
})
