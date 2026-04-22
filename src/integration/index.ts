/* eslint-disable complexity */
/* eslint-disable ts/naming-convention */

import type { AstroConfig, AstroIntegration } from 'astro'
import { envField } from 'astro/config'
import { fileURLToPath } from 'node:url'
import type { CredentialService, Service } from '../components/utils/video'
import type { AphexConfig } from './aphex'
import type { AutoImportConfig, AutoImportEntry, AutoImportPluginConfig } from './auto-import'
import type { TldrawConfig } from './tldraw'
import { vitePluginMediaKitAphex } from './aphex'
import { vitePluginMediaKitAutoImport } from './auto-import'
import { removeOriginalImages } from './remove-originals'
import { stripExifFromImages } from './strip-exif'
import { vitePluginMediaKitTldraw } from './tldraw'

export type { AphexConfig } from './aphex'
export type { AutoImportConfig, AutoImportEntry, AutoImportPluginConfig } from './auto-import'
export { tldrawDarkImport, transformAstroSource } from './auto-import'
export type { TldrawConfig } from './tldraw'
export type { TldrawImageOptions } from './tldraw'

/**
 * Configuration for the dev-mode image watermark overlay. When enabled, every
 * variant emitted by Astro's image pipeline is stamped with a tiled label
 * showing its pixel dimensions and encoded byte size, making it easy to confirm
 * visually which srcset candidate the browser loaded. The stamped byte count is
 * the pre-watermark size (i.e. what the variant would weigh without the
 * overlay) — that is the honest debug number.
 */
export type WatermarkConfig = {
	/**
	 * Counter-clockwise tilt in degrees applied to each repeated label. Defaults
	 * to `-30`.
	 */
	angle?: number
	/** Master toggle when object form is passed. Defaults to `true`. */
	enabled?: boolean
	/** Skip variants smaller than this on either axis (px). Defaults to `96`. */
	minDimension?: number
	/** Label fill/stroke opacity (0–1). Defaults to `0.8`. */
	opacity?: number
}

/**
 * Configuration for the astro-media-kit integration.
 */
export type MediaKitConfig = {
	/**
	 * Enable Apple Photos `~aphex/` import support via
	 * `@kitschpatrol/unplugin-aphex`. When enabled, `src="~aphex/Album/Photo"`
	 * paths in `<Image>` and `<Picture>` components are resolved to photos
	 * exported from macOS Photos.app. Set to `true` for defaults, `false` to
	 * disable, or pass an object to customize.
	 *
	 * @default false
	 */
	aphex?: AphexConfig | boolean
	/**
	 * Configure auto-importing of image assets in `.astro` files.
	 *
	 * - `true` — enable with default component config (`Image: ['src'], Picture:
	 *   ['src']`)
	 * - `false` — disable
	 * - `AutoImportPluginConfig` — full config with component-to-entries mapping
	 *
	 * @example
	 * 	autoImport: {
	 * 	components: {
	 * 	Image: ['src'],
	 * 	Picture: ['src', tldrawDarkImport],
	 * 	},
	 * 	}
	 *
	 * @default true
	 */
	autoImport?: AutoImportPluginConfig | boolean
	/**
	 * Remove unused original images from the build output after Astro has
	 * finished writing the site. Astro's image pipeline leaves the full-size
	 * source files in the assets directory even when every reference uses a
	 * transformed variant.
	 *
	 * @default false
	 */
	removeOriginals?: boolean
	/**
	 * Strip EXIF/XMP and other metadata from every image in the build output
	 * directory (including files copied from `public/`) at the end of the Astro
	 * build. Leaves source images on disk untouched. `jpg`, `jpeg`, `png`,
	 * `webp`, `tif`, `tiff`, `avif`, `heic`, and `gif` files are processed.
	 *
	 * @default false
	 */
	stripExif?: boolean
	/**
	 * Enable tldraw `.tldr` file support via `@kitschpatrol/unplugin-tldraw`.
	 * When enabled, `.tldr` file imports are converted to SVG/PNG images and fed
	 * into Astro's image pipeline, working with both `<Image>` and `<Picture>`
	 * components. Set to `true` for defaults, `false` to disable, or pass an
	 * object to customize.
	 *
	 * @default false
	 */
	tldraw?: boolean | TldrawConfig
	/**
	 * Configure video service env schema injection. Adds `env.schema` entries for
	 * the specified service(s) so Astro validates that required credentials are
	 * set at build time.
	 *
	 * - `'bunny'` / `'cloudflare'` / `'mux'` — single service
	 * - `Service[]` — multiple services
	 * - `true` — all services
	 * - `false` — no schema injection (default)
	 *
	 * @default false
	 */
	video?: boolean | Service | Service[]
	/**
	 * Stamp every responsive image variant with its pixel dimensions and encoded
	 * byte size as a tiled text overlay, for visual debugging of which srcset
	 * candidate the browser actually loaded. Registers a custom local image
	 * service that wraps Astro's built-in sharp service.
	 *
	 * Intended for dev use — a warning is logged if enabled outside `astro dev`.
	 * When `false` (the default), the image pipeline is left entirely untouched.
	 *
	 * @default false
	 */
	watermark?: boolean | WatermarkConfig
}

const DEFAULT_AUTO_IMPORT_ENTRIES: AutoImportConfig = 'src'

const DEFAULT_COMPONENT_CONFIGS: Record<string, AutoImportConfig> = {
	Image: DEFAULT_AUTO_IMPORT_ENTRIES,
	Picture: DEFAULT_AUTO_IMPORT_ENTRIES,
}

function resolveAutoImportEntry(entry: AutoImportEntry): {
	fromProp: string
	toProp: string
	transform?: (path: string) => string | undefined
} {
	if (typeof entry === 'string') {
		return { fromProp: entry, toProp: entry }
	}

	return {
		fromProp: entry.from,
		toProp: entry.to,
		...(entry.transform ? { transform: entry.transform } : {}),
	}
}

function resolveAutoImportEntries(config: AutoImportConfig) {
	const entries = Array.isArray(config) ? config : [config]
	return entries.map((entry) => resolveAutoImportEntry(entry))
}

/**
 * Astro integration for astro-media-kit.
 *
 * @example
 * 	// Your astro.config.ts
 * 	import mediaKit from 'astro-media-kit'
 * 	export default defineConfig({
 * 		integrations: [mediaKit()],
 * 	})
 */
export default function mediaKit(config?: MediaKitConfig): AstroIntegration {
	const aphex = config?.aphex ?? false
	const aphexEnabled = aphex !== false && (aphex === true || aphex.enabled !== false)
	const aphexConfig: AphexConfig = typeof aphex === 'object' ? aphex : {}

	const autoImport = config?.autoImport ?? true
	const autoImportEnabled =
		autoImport !== false && (autoImport === true || autoImport.enabled !== false)

	// Resolve component configs to the internal format
	const rawComponentConfigs =
		typeof autoImport === 'object'
			? // eslint-disable-next-line ts/no-unnecessary-condition
				(autoImport.components ?? DEFAULT_COMPONENT_CONFIGS)
			: DEFAULT_COMPONENT_CONFIGS
	const resolvedComponentConfigs: Record<
		string,
		Array<{
			fromProp: string
			toProp: string
			transform?: (path: string) => string | undefined
		}>
	> = {}
	for (const [name, entries] of Object.entries(rawComponentConfigs)) {
		resolvedComponentConfigs[name] = resolveAutoImportEntries(entries)
	}

	const tldraw = config?.tldraw ?? false
	const tldrawEnabled = tldraw !== false && (tldraw === true || tldraw.enabled !== false)
	const tldrawConfig: TldrawConfig = typeof tldraw === 'object' ? tldraw : {}

	const removeOriginalsEnabled = config?.removeOriginals ?? false

	const stripExifEnabled = config?.stripExif ?? false

	let astroConfig: AstroConfig | undefined

	const video = config?.video ?? false
	const videoServices: Service[] =
		video === true
			? (['bunny', 'cloudflare', 'mux'] as Service[])
			: video === false
				? []
				: Array.isArray(video)
					? video
					: [video]

	const watermark = config?.watermark ?? false
	const watermarkEnabled =
		watermark !== false && (watermark === true || watermark.enabled !== false)
	const watermarkResolved = {
		angle: typeof watermark === 'object' ? (watermark.angle ?? -30) : -30,
		minDimension: typeof watermark === 'object' ? (watermark.minDimension ?? 96) : 96,
		opacity: typeof watermark === 'object' ? (watermark.opacity ?? 0.8) : 0.8,
	}

	return {
		hooks: {
			async 'astro:build:done'({ dir, logger }) {
				if (removeOriginalsEnabled && astroConfig) {
					await removeOriginalImages(dir, astroConfig, logger)
				}

				if (stripExifEnabled) {
					await stripExifFromImages(dir, logger)
				}
			},
			'astro:config:done'({ config }) {
				astroConfig = config
			},
			'astro:config:setup'({ command, logger, updateConfig }) {
				if (videoServices.length > 0) {
					const envSchemaForService: Record<
						CredentialService,
						Record<string, ReturnType<typeof envField.string>>
					> = {
						bunny: {
							BUNNY_API_ACCESS_KEY: envField.string({ access: 'secret', context: 'server' }),
							BUNNY_HOSTNAME: envField.string({ access: 'secret', context: 'server' }),
							BUNNY_LIBRARY_ID: envField.string({ access: 'secret', context: 'server' }),
						},
						cloudflare: {
							CLOUDFLARE_STREAM_ACCOUNT_ID: envField.string({
								access: 'secret',
								context: 'server',
							}),
							CLOUDFLARE_STREAM_API_TOKEN: envField.string({ access: 'secret', context: 'server' }),
						},
						mux: {
							MUX_TOKEN_ID: envField.string({ access: 'secret', context: 'server' }),
							MUX_TOKEN_SECRET: envField.string({ access: 'secret', context: 'server' }),
						},
					}

					let schema: Record<string, ReturnType<typeof envField.string>> = {}
					for (const s of videoServices) {
						if (s in envSchemaForService) {
							// eslint-disable-next-line ts/no-unsafe-type-assertion -- guarded by in check
							schema = { ...schema, ...envSchemaForService[s as CredentialService] }
						}
					}

					updateConfig({ env: { schema } })
				}

				if (autoImportEnabled) {
					updateConfig({
						vite: {
							plugins: [vitePluginMediaKitAutoImport(resolvedComponentConfigs)],
						},
					})
				}

				if (aphexEnabled) {
					updateConfig({
						vite: {
							// eslint-disable-next-line ts/no-unsafe-type-assertion -- return typed as unknown to avoid Vite type graph bloat in .d.ts
							plugins: [vitePluginMediaKitAphex(aphexConfig) as never],
						},
					})
				}

				if (tldrawEnabled) {
					updateConfig({
						vite: {
							// eslint-disable-next-line ts/no-unsafe-type-assertion -- return typed as unknown to avoid Vite type graph bloat in .d.ts
							plugins: [vitePluginMediaKitTldraw(tldrawConfig) as never],
						},
					})
				}

				if (watermarkEnabled) {
					if (command !== 'dev') {
						logger.warn(
							`watermark enabled outside dev (command: ${command}) — image variants will be stamped in the build output`,
						)
					}
					updateConfig({
						image: {
							service: {
								config: { mediaKitWatermark: watermarkResolved },
								entrypoint: fileURLToPath(new URL('watermark-image-service.ts', import.meta.url)),
							},
						},
					})
				}
			},
		},
		name: 'astro-media-kit',
	}
}
