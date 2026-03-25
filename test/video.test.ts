import { describe, expect, it } from 'vitest'
import { bunnyIsValidMediaId } from '../src/components/utils/bunny'
import { cloudflareIsValidMediaId } from '../src/components/utils/cloudflare'
import { muxIsValidMediaId } from '../src/components/utils/mux'
import { inferServiceFromMediaId, validateServiceConfig } from '../src/components/utils/video'

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

describe('inferServiceFromMediaId', () => {
	it('infers bunny from UUID format', () => {
		expect(inferServiceFromMediaId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('bunny')
	})

	it('infers cloudflare from 32-char hex', () => {
		expect(inferServiceFromMediaId('81841bee83618bdde9278ab586e3568b')).toBe('cloudflare')
	})

	it('infers mux from 44-char alphanumeric', () => {
		expect(inferServiceFromMediaId('a'.repeat(44))).toBe('mux')
	})

	it('throws for unrecognized format', () => {
		expect(() => inferServiceFromMediaId('unknown-format')).toThrow(
			'Could not infer service from media id',
		)
	})
})

describe('validateServiceConfig', () => {
	const emptyConfig = {
		bunny: { apiAccessKey: '', hostname: '', libraryId: '' },
		cloudflare: { accountId: '', apiToken: '' },
		mux: { accessToken: '', secret: '' },
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
			mux: { accessToken: 'tok', secret: 'sec' },
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
