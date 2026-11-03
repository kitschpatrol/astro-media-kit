import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloudflareGetVideoInfo } from '../src/components/utils/cloudflare'

describe('cloudflareGetVideoInfo', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it.each(['', '?token=example'])(
		'builds a fallback URL without a doubled slash%s',
		async (query) => {
			const mediaId = '81841bee83618bdde9278ab586e3568b'
			const base = `https://customer-example.cloudflarestream.com/${mediaId}`
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(
					Response.json({
						result: {
							duration: 10,
							input: { width: 1920, height: 1080 },
							meta: { name: 'A clip' },
							playback: { hls: `${base}/manifest/video.m3u8${query}` },
							readyToStream: true,
							status: { state: 'ready' },
							thumbnail: `${base}/thumbnails/thumbnail.jpg`,
						},
					}),
				),
			)

			const info = await cloudflareGetVideoInfo(mediaId, {
				accountId: 'account',
				apiToken: 'token',
			})
			expect(info.mp4Url).toBe(`${base}/downloads/default.mp4${query}`)
		},
	)
})
