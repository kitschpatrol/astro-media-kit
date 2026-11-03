import { afterEach, describe, expect, it, vi } from 'vitest'
import { bunnyGetVideoInfo } from '../src/components/utils/bunny'

describe('bunnyGetVideoInfo', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it.each([
		['360p,720p,1080p', 720],
		['1080p,360p,480p', 480],
		['2160p,1080p,1440p', 1080],
		['1080p', 1080],
		['2160p', 2160],
	])('selects a usable MP4 fallback from %s', async (availableResolutions, resolution) => {
		const mediaId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				Response.json({
					availableResolutions,
					guid: mediaId,
					hasMP4Fallback: true,
					height: 2160,
					length: 10,
					status: 4,
					thumbnailFileName: 'thumbnail.jpg',
					width: 3840,
				}),
			),
		)

		const info = await bunnyGetVideoInfo(mediaId, {
			apiAccessKey: 'key',
			hostname: 'test.b-cdn.net',
			libraryId: 'library',
		})
		expect(info.mp4Url).toBe(`https://test.b-cdn.net/${mediaId}/play_${resolution}p.mp4`)
	})
})
