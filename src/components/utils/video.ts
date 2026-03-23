// Shared types for future video integrations
import type { BunnyConfig } from './bunny'
import type { CloudflareConfig } from './cloudflare'
import type { MuxConfig } from './mux'
import { bunnyGetVideoInfo, bunnyIsValidMediaId } from './bunny'
import { cloudflareGetVideoInfo, cloudflareIsValidMediaId } from './cloudflare'
import { muxGetVideoInfo, muxIsValidMediaId } from './mux'

export type VideoInfo = {
	captions: Array<{
		label: string
		src: string
		srclang: string
	}>
	height: number
	hlsUrl: string
	mp4Url: string
	posterUrl: string
	width: number
}

// Support additional services someday
export type ServiceConfig = {
	bunny: BunnyConfig
	cloudflare: CloudflareConfig
	mux: MuxConfig
}
export type Service = keyof ServiceConfig

/**
 * Normalizes different services into params that matter for the media player
 */
export async function getVideoInfo(
	mediaIdOrTitle: string,
	service: Service,
	config: ServiceConfig,
): Promise<VideoInfo> {
	switch (service) {
		case 'bunny': {
			const videoInfo = await bunnyGetVideoInfo(mediaIdOrTitle, config[service])
			return videoInfo
		}

		case 'cloudflare': {
			const videoInfo = await cloudflareGetVideoInfo(mediaIdOrTitle, config[service])
			return videoInfo
		}

		case 'mux': {
			const videoInfo = await muxGetVideoInfo(mediaIdOrTitle, config[service])
			return videoInfo
		}
	}
}

/**
 * Infer the service type from a media id — a bit perilous, but spares explicit configuration
 */
export function inferServiceFromMediaId(mediaId: string): Service {
	if (bunnyIsValidMediaId(mediaId)) {
		return 'bunny' as Service
	}

	if (cloudflareIsValidMediaId(mediaId)) {
		return 'cloudflare' as Service
	}

	if (muxIsValidMediaId(mediaId)) {
		return 'mux' as Service
	}

	throw new Error(`Could not infer service from media id "${mediaId}"`)
}
