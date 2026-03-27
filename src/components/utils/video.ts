// Shared types for video service integrations
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

export type ServiceConfig = {
	bunny: BunnyConfig
	cloudflare: CloudflareConfig
	mux: MuxConfig
	vimeo: Record<string, never>
	youtube: Record<string, never>
}
export type Service = keyof ServiceConfig

/** Services that require API credentials for server-side metadata fetching. */
export type CredentialService = 'bunny' | 'cloudflare' | 'mux'

/** Services that use client-side embed elements (no credentials needed). */
export type EmbedService = 'vimeo' | 'youtube'

/**
 * Validates that required credentials are present for the given service.
 * Throws with actionable message naming missing env vars.
 * No-op for embed services (YouTube, Vimeo) which need no credentials.
 */
export function validateServiceConfig(service: Service, config: ServiceConfig): void {
	const checks: Record<CredentialService, Array<{ envVar: string; value: string }>> = {
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

	if (!(service in checks)) return

	// eslint-disable-next-line ts/no-unsafe-type-assertion -- guarded by `in` check above
	const missing = checks[service as CredentialService].filter((c) => !c.value).map((c) => c.envVar)
	if (missing.length > 0) {
		throw new Error(
			`Missing env vars for "${service}" video service: ${missing.join(', ')}. Set these as secrets via astro:env or as environment variables.`,
		)
	}
}

// --- YouTube oEmbed ---

const YOUTUBE_ID_RE = /^[\w-]{11}$/

/** YouTube video IDs are exactly 11 characters: alphanumeric, hyphen, underscore. */
export function youtubeIsValidMediaId(mediaId: string): boolean {
	return YOUTUBE_ID_RE.test(mediaId)
}

async function youtubeGetVideoInfo(mediaId: string): Promise<VideoInfo> {
	const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(mediaId)}&format=json`
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`YouTube oEmbed request failed (${String(response.status)}) for "${mediaId}"`)
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion -- oEmbed JSON shape is well-known
	const data = (await response.json()) as {
		height: number
		thumbnail_url: string // eslint-disable-line ts/naming-convention -- oEmbed API field name
		title: string
		width: number
	}
	return {
		captions: [],
		duration: -1,
		height: data.height,
		hlsUrl: '',
		mp4Url: '',
		posterUrl: data.thumbnail_url,
		title: data.title,
		width: data.width,
	}
}

// --- Vimeo oEmbed ---

const VIMEO_ID_RE = /^\d+$/

/** Vimeo video IDs are numeric-only, variable length. */
export function vimeoIsValidMediaId(mediaId: string): boolean {
	return VIMEO_ID_RE.test(mediaId)
}

async function vimeoGetVideoInfo(mediaId: string): Promise<VideoInfo> {
	const url = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${encodeURIComponent(mediaId)}`
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Vimeo oEmbed request failed (${String(response.status)}) for "${mediaId}"`)
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion -- oEmbed JSON shape is well-known
	const data = (await response.json()) as {
		duration: number
		height: number
		thumbnail_url: string // eslint-disable-line ts/naming-convention -- oEmbed API field name
		title: string
		width: number
	}
	return {
		captions: [],
		duration: data.duration,
		height: data.height,
		hlsUrl: '',
		mp4Url: '',
		posterUrl: data.thumbnail_url,
		title: data.title,
		width: data.width,
	}
}

// --- Shared ---

/**
 * Normalizes different services into params that matter for the media player.
 */
export async function getVideoInfo(
	mediaIdOrTitle: string,
	service: Service,
	config: ServiceConfig,
): Promise<VideoInfo> {
	switch (service) {
		case 'bunny': {
			validateServiceConfig(service, config)
			return bunnyGetVideoInfo(mediaIdOrTitle, config[service])
		}

		case 'cloudflare': {
			validateServiceConfig(service, config)
			return cloudflareGetVideoInfo(mediaIdOrTitle, config[service])
		}

		case 'mux': {
			validateServiceConfig(service, config)
			return muxGetVideoInfo(mediaIdOrTitle, config[service])
		}

		case 'vimeo': {
			return vimeoGetVideoInfo(mediaIdOrTitle)
		}

		case 'youtube': {
			return youtubeGetVideoInfo(mediaIdOrTitle)
		}
	}
}

/**
 * Infer the service type from a media id — a bit perilous, but spares explicit configuration.
 * Checks more specific formats first (Bunny UUID, Cloudflare 32-hex, Mux 44-char),
 * then YouTube (11-char alphanumeric) and Vimeo (numeric-only).
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

	if (youtubeIsValidMediaId(mediaId)) {
		return 'youtube' as Service
	}

	if (vimeoIsValidMediaId(mediaId)) {
		return 'vimeo' as Service
	}

	throw new Error(`Could not infer service from media id "${mediaId}"`)
}

/** Check if a service is an embed type (YouTube, Vimeo) that needs no API credentials. */
export function isEmbedService(service: Service): service is EmbedService {
	return service === 'youtube' || service === 'vimeo'
}
