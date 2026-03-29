import { describe, expect, it } from 'vitest'
import { bunnyIsValidMediaId } from '../src/components/utils/bunny'
import { cloudflareIsValidMediaId } from '../src/components/utils/cloudflare'
import { muxIsValidMediaId } from '../src/components/utils/mux'
import { resolveVideoSource, validateServiceConfig } from '../src/components/utils/video'

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
