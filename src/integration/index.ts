/* eslint-disable complexity */
/* eslint-disable ts/naming-convention */

import type { AstroConfig, AstroIntegration } from 'astro'
import { envField } from 'astro/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { CredentialService, Service } from '../components/utils/video'
import type { AphexConfig } from './aphex'
import type { AutoImportConfig, AutoImportPluginConfig } from './auto-import'
import type { TldrawConfig } from './tldraw'
import type { ResolvedWatermarkConfig } from './watermark-image-service'
import { vitePluginMediaKitAphex } from './aphex'
import { imageOnlyImport, vitePluginMediaKitAutoImport } from './auto-import'
import { removeOriginalImages } from './remove-originals'
import { stripExifFromImages } from './strip-exif'
import { vitePluginMediaKitTldraw } from './tldraw'

export type { AphexConfig } from './aphex'
export type { AutoImportConfig, AutoImportEntry, AutoImportPluginConfig } from './auto-import'
export { imageOnlyImport, tldrawDarkImport, transformAstroSource } from './auto-import'
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
	 * - `true` — enable with default component config (`Image: 'src', Picture:
	 *   'src', ZoomLink: imageOnlyImport`)
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
	 * finished writing the site. Astro deletes a raster original that only its
	 * transforms used; this removes the originals it still leaves: SVGs processed
	 * with `image.dangerouslyProcessSVG`, whose source path Astro loses when it
	 * builds the SVG component, and any original kept by a raw `src` read whose
	 * URL never reaches the output.
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
	 * candidate the browser actually loaded. Registers a local image service
	 * wrapping Astro's built-in sharp service as the build-time service, which
	 * dev and prerendering use. Pages rendered on demand keep the configured
	 * runtime service.
	 *
	 * Intended for dev use — a warning is logged for builds. When `false` (the
	 * default), the image pipeline is left entirely untouched.
	 *
	 * @default false
	 */
	watermark?: boolean | WatermarkConfig
}

function readUpstreamClientTypes(specifier: string): string {
	const url = import.meta.resolve(specifier)
	return readFileSync(fileURLToPath(url), 'utf8')
}

const DEFAULT_AUTO_IMPORT_ENTRIES: AutoImportConfig = 'src'

const DEFAULT_COMPONENT_CONFIGS: Record<string, AutoImportConfig> = {
	Image: DEFAULT_AUTO_IMPORT_ENTRIES,
	Picture: DEFAULT_AUTO_IMPORT_ENTRIES,
	ZoomLink: imageOnlyImport,
}

/**
 * Resolve a `boolean | { enabled?: boolean } | undefined` toggle config to a
 * single enabled boolean. Default applies when the value is `undefined`; an
 * object form is enabled unless `enabled: false` is explicitly set.
 */
function isToggleEnabled(
	value: boolean | undefined | { enabled?: boolean },
	defaultEnabled: boolean,
): boolean {
	if (value === undefined) {
		return defaultEnabled
	}

	return typeof value === 'boolean' ? value : value.enabled !== false
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
	const aphexEnabled = isToggleEnabled(config?.aphex, false)
	const aphexConfig: AphexConfig = typeof config?.aphex === 'object' ? config.aphex : {}

	const autoImportEnabled = isToggleEnabled(config?.autoImport, true)
	const autoImportObject = typeof config?.autoImport === 'object' ? config.autoImport : undefined
	const componentConfigs = autoImportObject?.components ?? DEFAULT_COMPONENT_CONFIGS

	const tldrawEnabled = isToggleEnabled(config?.tldraw, false)
	const tldrawConfig: TldrawConfig = typeof config?.tldraw === 'object' ? config.tldraw : {}

	const shouldRemoveOriginals = config?.removeOriginals ?? false

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

	const watermarkEnabled = isToggleEnabled(config?.watermark, false)
	const {
		angle = -30,
		minDimension = 96,
		opacity = 0.8,
	} = typeof config?.watermark === 'object' ? config.watermark : {}
	const watermarkResolved: ResolvedWatermarkConfig = { angle, minDimension, opacity }

	return {
		hooks: {
			async 'astro:build:done'({ dir, logger }) {
				if (shouldRemoveOriginals && astroConfig) {
					await removeOriginalImages(dir, astroConfig, logger)
				}

				if (stripExifEnabled) {
					await stripExifFromImages(dir, logger)
				}
			},
			'astro:config:done'({ config: resolvedAstroConfig, injectTypes, logger }) {
				astroConfig = resolvedAstroConfig

				if (aphexEnabled) {
					try {
						injectTypes({
							content: readUpstreamClientTypes('@kitschpatrol/unplugin-aphex/dist/client.d.ts'),
							filename: 'aphex.d.ts',
						})
					} catch (error) {
						logger.error(
							`Failed to inject @kitschpatrol/unplugin-aphex client types: ${error instanceof Error ? error.message : String(error)}`,
						)
					}
				}

				if (tldrawEnabled) {
					try {
						injectTypes({
							content: readUpstreamClientTypes('@kitschpatrol/unplugin-tldraw/dist/client.d.ts'),
							filename: 'tldraw.d.ts',
						})
					} catch (error) {
						logger.error(
							`Failed to inject @kitschpatrol/unplugin-tldraw client types: ${error instanceof Error ? error.message : String(error)}`,
						)
					}
				}
			},
			'astro:config:setup'({ command, config: setupConfig, logger, updateConfig }) {
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
						if (Object.hasOwn(envSchemaForService, s)) {
							schema = { ...schema, ...envSchemaForService[s as CredentialService] }
						}
					}

					updateConfig({ env: { schema } })
				}

				if (autoImportEnabled) {
					updateConfig({
						vite: {
							plugins: [vitePluginMediaKitAutoImport(componentConfigs, setupConfig)],
						},
					})
				}

				if (aphexEnabled) {
					updateConfig({
						vite: {
							plugins: [vitePluginMediaKitAphex(aphexConfig) as never],
						},
					})
				}

				if (tldrawEnabled) {
					updateConfig({
						vite: {
							plugins: [vitePluginMediaKitTldraw(tldrawConfig) as never],
						},
					})
				}

				if (!watermarkEnabled) {
					return
				}

				if (command === 'build') {
					logger.warn(
						'watermark enabled for a build — image variants will be stamped in the build output',
					)
				}

				// Dev and prerendering use the build-time service. Pages rendered on
				// demand keep whichever runtime service is configured, so a watermark
				// left on never reaches a deployed image endpoint.
				const { service } = setupConfig.image
				updateConfig({
					image: {
						service: {
							build: {
								config: { mediaKitWatermark: watermarkResolved },
								entrypoint: fileURLToPath(new URL('watermark-image-service.ts', import.meta.url)),
							},
							runtime: 'runtime' in service ? service.runtime : service,
						},
					},
				})
			},
		},
		name: 'astro-media-kit',
	}
}
