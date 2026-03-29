// Shared types for video service integrations
import { getVideoResolution } from '@oscnord/get-video-resolution'
import type { BunnyConfig } from './bunny'
import type { CloudflareConfig } from './cloudflare'
import type { MuxConfig } from './mux'
import { bunnyGetVideoInfo, bunnyIsValidMediaId } from './bunny'
import { cloudflareGetVideoInfo, cloudflareIsValidMediaId } from './cloudflare'
import { isDirectMediaUrl, isLocalPath, tryParseUrl } from './media'
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
	local: Record<string, never>
	mux: MuxConfig
	oembed: Record<string, never>
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

// --- Local file / remote MP4 ---

async function localGetVideoInfo(src: string, poster: string): Promise<VideoInfo> {
	let width = 0
	let height = 0
	let duration = -1

	try {
		const info: { duration?: number; height: number; width: number } = await getVideoResolution(src)
		width = info.width
		height = info.height
		if (info.duration !== undefined) duration = info.duration
	} catch {
		// Probe failed — fall back to zero dimensions (no aspect ratio).
	}

	return {
		captions: [],
		duration,
		height,
		hlsUrl: '',
		mp4Url: '',
		posterUrl: poster,
		title: undefined,
		width,
	}
}

// --- YouTube oEmbed ---

const YOUTUBE_ID_RE = /^[\w-]{11}$/

/** YouTube video IDs are exactly 11 characters: alphanumeric, hyphen, underscore. */
export function youtubeIsValidMediaId(mediaId: string): boolean {
	return YOUTUBE_ID_RE.test(mediaId)
}

const EMBED_DEFAULT_WIDTH = 1920

async function youtubeGetVideoInfo(mediaId: string): Promise<VideoInfo> {
	// OEmbed returns small embed widget dimensions (~356x200), not actual
	// video resolution. We scale up to EMBED_DEFAULT_WIDTH preserving the
	// aspect ratio. Actual source resolution would require the YouTube
	// Data API v3 with owner authentication.
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

	const scale = data.width > 0 ? EMBED_DEFAULT_WIDTH / data.width : 1
	return {
		captions: [],
		duration: -1,
		height: Math.round(data.height * scale),
		hlsUrl: '',
		mp4Url: '',
		posterUrl: data.thumbnail_url,
		title: data.title,
		width: EMBED_DEFAULT_WIDTH,
	}
}

// --- Vimeo oEmbed ---

const VIMEO_ID_RE = /^\d+$/

/** Vimeo video IDs are numeric-only, variable length. */
export function vimeoIsValidMediaId(mediaId: string): boolean {
	return VIMEO_ID_RE.test(mediaId)
}

async function vimeoGetVideoInfo(mediaId: string): Promise<VideoInfo> {
	// OEmbed returns embed dimensions, not actual video resolution.
	// Passing width=1920 gives dimensions at the correct aspect ratio
	// (e.g. 1920x1080 for 16:9). Actual source resolution would require
	// the full Vimeo API with authentication.
	const url = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${encodeURIComponent(mediaId)}&width=1920`
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
	/** Poster URL — only used by the 'local' service. */
	poster = '',
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

		case 'local': {
			return localGetVideoInfo(mediaIdOrTitle, poster)
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

		case 'oembed': {
			throw new Error(
				'oEmbed videos are handled separately via fetchOEmbed() — do not call getVideoInfo() for oembed service.',
			)
		}
	}
}

// --- URL extraction helpers ---

const YOUTUBE_HOSTS = new Set([
	'm.youtube.com',
	'music.youtube.com',
	'www.youtube.com',
	'youtu.be',
	'youtube.com',
])

/** Extracts a YouTube video ID from various YouTube URL formats. */
function extractYouTubeId(url: URL): string | undefined {
	const host = url.hostname.toLowerCase()
	if (!YOUTUBE_HOSTS.has(host)) return undefined

	// Short URL: youtu.be/ID
	if (host === 'youtu.be') {
		const id = url.pathname.slice(1).split('/')[0]
		return id && youtubeIsValidMediaId(id) ? id : undefined
	}

	// /watch?v=ID
	if (url.pathname === '/watch') {
		const id = url.searchParams.get('v')
		return id && youtubeIsValidMediaId(id) ? id : undefined
	}

	// /embed/ID, /shorts/ID, /live/ID, /v/ID
	const pathMatch = /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(url.pathname)
	if (pathMatch) {
		const id = pathMatch[1]
		return id && youtubeIsValidMediaId(id) ? id : undefined
	}

	return undefined
}

const VIMEO_HOSTS = new Set(['player.vimeo.com', 'vimeo.com', 'www.vimeo.com'])

/** Extracts a Vimeo video ID from various Vimeo URL formats. */
function extractVimeoId(url: URL): string | undefined {
	const host = url.hostname.toLowerCase()
	if (!VIMEO_HOSTS.has(host)) return undefined

	// Player.vimeo.com/video/ID
	if (host === 'player.vimeo.com') {
		const match = /^\/video\/(\d+)/.exec(url.pathname)
		return match?.[1]
	}

	// Vimeo.com/ID or vimeo.com/channels/.../ID
	const segments = url.pathname.split('/').filter(Boolean)
	const lastSegment = segments.at(-1)
	return lastSegment && vimeoIsValidMediaId(lastSegment) ? lastSegment : undefined
}

export type ResolvedSource = {
	identifier: string
	service: Service
}

/** Infer service from a raw media ID string using format-based regex matching. */
function inferServiceFromId(mediaId: string): Service | undefined {
	if (bunnyIsValidMediaId(mediaId)) return 'bunny'
	if (cloudflareIsValidMediaId(mediaId)) return 'cloudflare'
	if (muxIsValidMediaId(mediaId)) return 'mux'
	if (youtubeIsValidMediaId(mediaId)) return 'youtube'
	if (vimeoIsValidMediaId(mediaId)) return 'vimeo'
	return undefined
}

/** Resolve a URL into a service type and identifier. */
function resolveFromUrl(src: string, url: URL): ResolvedSource | undefined {
	const youtubeId = extractYouTubeId(url)
	if (youtubeId) return { identifier: youtubeId, service: 'youtube' }

	const vimeoId = extractVimeoId(url)
	if (vimeoId) return { identifier: vimeoId, service: 'vimeo' }

	if (isDirectMediaUrl(url)) return { identifier: src, service: 'local' }

	return { identifier: src, service: 'oembed' }
}

/**
 * Resolves a `src` string into a service type and identifier.
 *
 * Accepts URLs (YouTube, Vimeo, direct media files, or generic pages for oEmbed),
 * raw service IDs (Bunny UUID, Cloudflare hex, Mux alphanumeric, YouTube 11-char,
 * Vimeo numeric), local file paths, or Bunny title strings (when `service` is
 * explicitly `'bunny'`).
 *
 * When `service` is explicitly provided, it overrides inference but URL-to-ID
 * extraction still runs so downstream code receives the extracted identifier.
 */
export function resolveVideoSource(src: string, service?: Service): ResolvedSource {
	const url = tryParseUrl(src)

	if (url) {
		const resolved = resolveFromUrl(src, url)
		if (resolved) {
			return { identifier: resolved.identifier, service: service ?? resolved.service }
		}
	}

	// Not a URL — try ID pattern matching
	const inferred = inferServiceFromId(src)
	if (inferred) return { identifier: src, service: service ?? inferred }

	// Local file path (e.g. /video.mp4, ./assets/video.webm)
	if (isLocalPath(src)) return { identifier: src, service: service ?? 'local' }

	// Bunny title search (requires explicit service)
	if (service === 'bunny') return { identifier: src, service: 'bunny' }

	throw new Error(
		`Could not infer video service from "${src}". Pass a URL, a recognized service ID, or set the "service" prop explicitly.`,
	)
}

/** Check if a service is an embed type (YouTube, Vimeo) that needs no API credentials. */
export function isEmbedService(service: Service): service is EmbedService {
	return service === 'youtube' || service === 'vimeo'
}
