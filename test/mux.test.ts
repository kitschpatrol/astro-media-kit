import type { Asset } from '@mux/ts/resources/video/assets'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { muxGetVideoInfo } from '../src/components/utils/mux'

const { retrieve } = vi.hoisted(() => ({
	retrieve: vi.fn<(assetId: string, options?: { signal?: AbortSignal }) => Promise<unknown>>(),
}))

vi.mock('@mux/ts', () => ({
	default: class {
		video = { assets: { retrieve } }
	},
}))

const mediaId = 'a'.repeat(44)
const config = { accessToken: 'token', secret: 'secret' }

function stubRenditions(renditions: Asset.StaticRenditions, meta?: Asset['meta']): void {
	/* eslint-disable ts/naming-convention -- Mux API response field names. */
	retrieve.mockResolvedValue({
		...(meta && { meta }),
		playback_ids: [{ id: 'playback', policy: 'public' }],
		static_renditions: renditions,
		status: 'ready',
		tracks: [{ max_height: 1080, max_width: 1920, type: 'video' }],
	} satisfies Partial<Asset>)
	/* eslint-enable ts/naming-convention */
}

describe('muxGetVideoInfo', () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it('selects the largest ready video rendition from the current API', async () => {
		stubRenditions({
			files: [
				{ name: 'audio.m4a', status: 'ready' },
				{ name: '2160p.mp4', status: 'preparing', width: 3840 },
				{ name: '720p.mp4', status: 'ready', width: 1280 },
				{ name: '1080p.mp4', status: 'ready', width: 1920 },
			],
		})
		const info = await muxGetVideoInfo(mediaId, config)
		expect(info.mp4Url).toBe('https://stream.mux.com/playback/1080p.mp4')
		const [assetId, options] = retrieve.mock.calls[0]!
		expect(assetId).toBe(mediaId)
		expect(options?.signal).toBeInstanceOf(AbortSignal)
	})

	it('takes the title from the asset metadata, when it has one', async () => {
		const renditions: Asset.StaticRenditions = {
			files: [{ name: 'high.mp4', status: 'ready', width: 1920 }],
		}
		stubRenditions(renditions)
		const untitled = await muxGetVideoInfo(mediaId, config)
		expect(untitled.title).toBeUndefined()
		stubRenditions(renditions, { title: 'Penguins at dusk' })
		const titled = await muxGetVideoInfo(mediaId, config)
		expect(titled.title).toBe('Penguins at dusk')
	})

	it('supports legacy aggregate readiness and skips audio-only files', async () => {
		stubRenditions({
			files: [
				{ name: 'audio.m4a' },
				{ name: 'high.mp4', width: 1920 },
				{ name: 'low.mp4', width: 640 },
			],
			status: 'ready',
		})
		const info = await muxGetVideoInfo(mediaId, config)
		expect(info.mp4Url).toBe('https://stream.mux.com/playback/high.mp4')
	})

	it.each<Asset.StaticRenditions>([
		{ files: [], status: 'ready' },
		{ status: 'ready' },
		{ files: [{ name: 'audio.m4a', status: 'ready' }] },
		{ files: [{ name: 'highest.mp4', status: 'preparing' }] },
		{ files: [{ name: 'high.mp4' }], status: 'preparing' },
		{ files: [{ width: 1920 }], status: 'ready' },
	])(
		'rejects missing or unavailable MP4 files with an actionable error: %j',
		async (renditions) => {
			stubRenditions(renditions)
			await expect(muxGetVideoInfo(mediaId, config)).rejects.toThrow(
				'does not have a ready fallback mp4 rendition',
			)
		},
	)
})
