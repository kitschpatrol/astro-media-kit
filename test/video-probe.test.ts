import { afterEach, describe, expect, it, vi } from 'vitest'
import { getVideoInfo } from '../src/components/utils/video'

const { getVideoResolution } = vi.hoisted(() => ({
	getVideoResolution: vi.fn<
		(
			source: string,
			options?: { signal?: AbortSignal },
		) => Promise<{
			audioTracks?: Array<{ codec?: string }>
			codec?: string
			duration?: number
			height: number
			rotation?: number
			width: number
		}>
	>(),
}))

vi.mock('@oscnord/get-video-resolution', () => ({ getVideoResolution }))

const noop = (): void => undefined

const localOnlyConfig = {
	bunny: { apiAccessKey: '', hostname: '', libraryId: '' },
	cloudflare: { accountId: '', apiToken: '' },
	local: {},
	mux: { accessToken: '', secret: '' },
	oembed: {},
	vimeo: {},
	youtube: {},
}

const serviceConfig = {
	...localOnlyConfig,
	bunny: { apiAccessKey: 'key', hostname: 'test.b-cdn.net', libraryId: 'library' },
	cloudflare: { accountId: 'account', apiToken: 'token' },
}

const bunnyId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const cloudflareId = '81841bee83618bdde9278ab586e3568b'
const cloudflareBase = `https://customer-example.cloudflarestream.com/${cloudflareId}`

/** Answer each service's API with a ready video, as `fetch` would. */
function stubServiceApis(): void {
	vi.stubGlobal(
		'fetch',
		vi.fn((url: string) =>
			Response.json(
				url.startsWith('https://video.bunnycdn.com/')
					? {
							availableResolutions: '720p',
							guid: bunnyId,
							hasMP4Fallback: true,
							height: 720,
							length: 10,
							status: 4,
							thumbnailFileName: 'thumbnail.jpg',
							width: 1280,
						}
					: {
							result: {
								duration: 10,
								input: { width: 1920, height: 1080 },
								playback: { hls: `${cloudflareBase}/manifest/video.m3u8` },
								readyToStream: true,
								status: { state: 'ready' },
								thumbnail: `${cloudflareBase}/thumbnails/thumbnail.jpg`,
							},
						},
			),
		),
	)
}

describe('direct media probes', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
		getVideoResolution.mockReset()
	})

	it('gives a remote probe the shared request timeout', async () => {
		getVideoResolution.mockResolvedValue({ duration: 3, height: 720, width: 1280 })
		const info = await getVideoInfo('https://cdn.example/clip.mp4', 'local', localOnlyConfig)
		const [source, options] = getVideoResolution.mock.calls[0]!
		expect(source).toBe('https://cdn.example/clip.mp4')
		expect(options?.signal).toBeInstanceOf(AbortSignal)
		expect(info.width).toBe(1280)
		expect(info.height).toBe(720)
		expect(info.duration).toBe(3)
	})

	it.for([90, 270])('turns a clip stored on its side by %i degrees upright', async (rotation) => {
		getVideoResolution.mockResolvedValue({ height: 1080, rotation, width: 1920 })
		const info = await getVideoInfo('https://cdn.example/portrait.mov', 'local', localOnlyConfig)
		expect(info.width).toBe(1080)
		expect(info.height).toBe(1920)
	})

	it.for([0, 180])('keeps the stored frame of a clip rotated by %i degrees', async (rotation) => {
		getVideoResolution.mockResolvedValue({ height: 1080, rotation, width: 1920 })
		const info = await getVideoInfo('https://cdn.example/landscape.mov', 'local', localOnlyConfig)
		expect(info.width).toBe(1920)
		expect(info.height).toBe(1080)
	})

	it('reports a failed remote probe, and stays quiet about a missing local file', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(noop)
		getVideoResolution.mockRejectedValue(new Error('The operation timed out'))

		const info = await getVideoInfo('https://cdn.example/clip.mp4', 'local', localOnlyConfig)
		expect(info.width).toBe(0)
		expect(warn).toHaveBeenCalledOnce()
		expect(warn.mock.calls[0]?.[0]).toContain('https://cdn.example/clip.mp4')
		expect(warn.mock.calls[0]?.[0]).toContain('The operation timed out')

		warn.mockClear()
		await getVideoInfo('/missing.mp4', 'local', localOnlyConfig)
		expect(getVideoResolution).toHaveBeenCalledTimes(3)
		expect(warn).not.toHaveBeenCalled()
	})

	it('finds sound in the audio tracks a file holds, and none where it holds none', async () => {
		getVideoResolution.mockResolvedValueOnce({
			audioTracks: [{ codec: 'mp4a.40.2' }],
			codec: 'avc1.64001f',
			height: 720,
			width: 1280,
		})
		const sound = await getVideoInfo('https://cdn.example/sound.mp4', 'local', localOnlyConfig)
		expect(sound.hasAudio).toBe(true)

		// A file's probe reads its whole track list, codecs or not
		getVideoResolution.mockResolvedValueOnce({ width: 1280, height: 720 })
		const silent = await getVideoInfo('https://cdn.example/silent.mp4', 'local', localOnlyConfig)
		expect(silent.hasAudio).toBe(false)
	})

	it('reads no sound from a manifest only where its variants declare their codecs', async () => {
		getVideoResolution.mockResolvedValueOnce({ codec: 'avc1.64001f', height: 720, width: 1280 })
		const silent = await getVideoInfo('https://cdn.example/silent.m3u8', 'local', localOnlyConfig)
		expect(silent.hasAudio).toBe(false)

		getVideoResolution.mockResolvedValueOnce({ width: 1280, height: 720 })
		const unknown = await getVideoInfo('https://cdn.example/bare.m3u8', 'local', localOnlyConfig)
		expect(unknown.hasAudio).toBeUndefined()

		getVideoResolution.mockResolvedValueOnce({
			audioTracks: [{ codec: 'mp4a.40.2' }],
			height: 720,
			width: 1280,
		})
		const sound = await getVideoInfo('https://cdn.example/sound.m3u8', 'local', localOnlyConfig)
		expect(sound.hasAudio).toBe(true)
	})

	it('leaves sound unknown when nothing can be probed', async () => {
		vi.spyOn(console, 'warn').mockImplementation(noop)
		getVideoResolution.mockRejectedValue(new Error('Not found'))
		const info = await getVideoInfo('/missing.mp4', 'local', localOnlyConfig)
		expect(info.hasAudio).toBeUndefined()
	})

	it.for([
		['bunny', bunnyId, `https://test.b-cdn.net/${bunnyId}/playlist.m3u8`],
		['cloudflare', cloudflareId, `${cloudflareBase}/manifest/video.m3u8`],
	] as const)(
		'reads whether a %s video has sound from its manifest',
		async ([service, id, manifest]) => {
			stubServiceApis()
			getVideoResolution.mockResolvedValue({ codec: 'avc1.64001f', height: 720, width: 1280 })
			const info = await getVideoInfo(id, service, serviceConfig)
			expect(getVideoResolution).toHaveBeenCalledOnce()
			const [source, options] = getVideoResolution.mock.calls[0]!
			expect(source).toBe(manifest)
			expect(options?.signal).toBeInstanceOf(AbortSignal)
			expect(info.hasAudio).toBe(false)
		},
	)

	it('keeps the volume of a service video whose manifest cannot be read, and says why', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(noop)
		stubServiceApis()
		getVideoResolution.mockRejectedValue(new Error('HTTP 403'))
		const info = await getVideoInfo(bunnyId, 'bunny', serviceConfig)
		expect(info.hasAudio).toBeUndefined()
		expect(info.width).toBe(1280)
		expect(warn).toHaveBeenCalledOnce()
		expect(warn.mock.calls[0]?.[0]).toContain(`https://test.b-cdn.net/${bunnyId}/playlist.m3u8`)
		expect(warn.mock.calls[0]?.[0]).toContain('HTTP 403')
	})
})
