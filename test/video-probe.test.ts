import { afterEach, describe, expect, it, vi } from 'vitest'
import { getVideoInfo } from '../src/components/utils/video'

const { getVideoResolution } = vi.hoisted(() => ({
	getVideoResolution:
		vi.fn<
			(
				source: string,
				options?: { signal?: AbortSignal },
			) => Promise<{ duration?: number; height: number; rotation?: number; width: number }>
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

describe('direct media probes', () => {
	afterEach(() => {
		vi.restoreAllMocks()
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
})
