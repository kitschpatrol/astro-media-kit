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
	/** Duration in seconds, -1 if unknown */
	duration: number
	height: number
	hlsUrl: string
	mp4Url: string
	posterUrl: string
	title: string | undefined
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
 * Validates that required credentials are present for the given service.
 * Throws with actionable message naming missing env vars.
 */
export function validateServiceConfig(service: Service, config: ServiceConfig): void {
	const checks: Record<Service, Array<{ envVar: string; value: string }>> = {
		bunny: [
			{ envVar: 'BUNNY_API_ACCESS_KEY', value: config.bunny.apiAccessKey },
			{ envVar: 'BUNNY_HOSTNAME', value: config.bunny.hostname },
			{ envVar: 'BUNNY_LIBRARY_ID', value: config.bunny.libraryId },
		],
		cloudflare: [
			{ envVar: 'CLOUDFLARE_STREAM_ACCOUNT_ID', value: config.cloudflare.accountId },
			{ envVar: 'CLOUDFLARE_STREAM_API_TOKEN', value: config.cloudflare.apiToken },
		],
		mux: [
			{ envVar: 'MUX_TOKEN_ID', value: config.mux.accessToken },
			{ envVar: 'MUX_TOKEN_SECRET', value: config.mux.secret },
		],
	}

	const missing = checks[service].filter((c) => !c.value).map((c) => c.envVar)
	if (missing.length > 0) {
		throw new Error(
			`Missing env vars for "${service}" video service: ${missing.join(', ')}. Set these as secrets via astro:env or as environment variables.`,
		)
	}
}

/**
 * Normalizes different services into params that matter for the media player
 */
export async function getVideoInfo(
	mediaIdOrTitle: string,
	service: Service,
	config: ServiceConfig,
): Promise<VideoInfo> {
	validateServiceConfig(service, config)

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
