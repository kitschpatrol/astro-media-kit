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

	it('offers no fallback for an unfamiliar HLS URL', async () => {
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
						playback: { hls: `${base}/other/stream.m3u8` },
						readyToStream: true,
						status: { state: 'ready' },
						thumbnail: `${base}/thumbnails/thumbnail.jpg`,
					},
				}),
			),
		)

		const info = await cloudflareGetVideoInfo(mediaId, { accountId: 'account', apiToken: 'token' })
		expect(info.mp4Url).toBe('')
	})

	describe('responses missing optional fields', () => {
		const mediaId = '81841bee83618bdde9278ab586e3568b'
		const base = `https://customer-example.cloudflarestream.com/${mediaId}`
		const ready = {
			duration: 10,
			input: { width: 1920, height: 1080 },
			playback: { hls: `${base}/manifest/video.m3u8` },
			readyToStream: true,
			status: { state: 'ready' },
			thumbnail: `${base}/thumbnails/thumbnail.jpg`,
		}

		function stubResult(result: Record<string, unknown>): void {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ result })))
		}

		async function getInfo() {
			return cloudflareGetVideoInfo(mediaId, { accountId: 'account', apiToken: 'token' })
		}

		it('titles a video by its public details when the file has no name', async () => {
			stubResult({ ...ready, publicDetails: { title: 'A public title' } })
			const info = await getInfo()
			expect(info.title).toBe('A public title')
		})

		it('prefers the file name over the public title', async () => {
			stubResult({ ...ready, meta: { name: 'A clip' }, publicDetails: { title: 'A public title' } })
			const info = await getInfo()
			expect(info.title).toBe('A clip')
		})

		it('leaves the title undefined without a name or public details', async () => {
			stubResult({ ...ready, meta: { name: '' } })
			const info = await getInfo()
			expect(info.title).toBeUndefined()
		})

		it('rejects a video without dimensions by name', async () => {
			const { input, ...withoutInput } = ready
			expect(input).toBeDefined()
			stubResult(withoutInput)
			await expect(getInfo()).rejects.toThrow(
				`Cloudflare video with id "${mediaId}" does not report its dimensions.`,
			)
		})

		it('rejects a video without an HLS URL by name', async () => {
			const { playback, ...withoutPlayback } = ready
			expect(playback).toBeDefined()
			stubResult({ ...withoutPlayback, meta: { name: 'A clip' } })
			await expect(getInfo()).rejects.toThrow(
				`Cloudflare video "A clip" with id "${mediaId}" does not have an HLS URL.`,
			)
		})
	})
})
