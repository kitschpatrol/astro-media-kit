/* eslint-disable complexity */
/* eslint-disable ts/naming-convention */

import type { AstroIntegration } from 'astro'
import type { CredentialService, Service } from '../components/utils/video'
import type { AphexConfig } from './aphex'
import type { AutoImportConfig, AutoImportEntry, AutoImportPluginConfig } from './auto-import'
import type { TldrawConfig } from './tldraw'

export type { AphexConfig } from './aphex'
export type { AutoImportConfig, AutoImportEntry, AutoImportPluginConfig } from './auto-import'
export { tldrawDarkImport, transformAstroSource } from './auto-import'
export type { TldrawConfig } from './tldraw'
export type { TldrawImageOptions } from './tldraw'

/**
 * Configuration for the astro-media-kit integration.
 */
export type MediaKitConfig = {
	/**
	 * Enable Apple Photos `~aphex/` import support via `@kitschpatrol/unplugin-aphex`.
	 * When enabled, `src="~aphex/Album/Photo"` paths in `<Image>` and `<Picture>`
	 * components are resolved to photos exported from macOS Photos.app.
	 * Set to `true` for defaults, `false` to disable, or pass an object to customize.
	 * @default false
	 */
	aphex?: AphexConfig | boolean
	/**
	 * Configure auto-importing of image assets in `.astro` files.
	 *
	 * - `true` — enable with default component config (`Image: ['src'], Picture: ['src']`)
	 * - `false` — disable
	 * - `AutoImportPluginConfig` — full config with component-to-entries mapping
	 * @example
	 * ```ts
	 * autoImport: {
	 *   components: {
	 *     Image: ['src'],
	 *     Picture: ['src', tldrawDarkImport],
	 *   },
	 * }
	 * ```
	 * @default true
	 */
	autoImport?: AutoImportPluginConfig | boolean
	/**
	 * Enable tldraw `.tldr` file support via `@kitschpatrol/unplugin-tldraw`.
	 * When enabled, `.tldr` file imports are converted to SVG/PNG images
	 * and fed into Astro's image pipeline, working with both `<Image>`
	 * and `<Picture>` components.
	 * Set to `true` for defaults, `false` to disable, or pass an object to customize.
	 * @default false
	 */
	tldraw?: boolean | TldrawConfig
	/**
	 * Configure video service env schema injection.
	 * Adds `env.schema` entries for the specified service(s) so Astro
	 * validates that required credentials are set at build time.
	 * - `'bunny'` / `'cloudflare'` / `'mux'` — single service
	 * - `Service[]` — multiple services
	 * - `true` — all services
	 * - `false` — no schema injection (default)
	 * @default false
	 */
	video?: boolean | Service | Service[]
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
 * @example
 * ```ts
 * // astro.config.ts
 * import mediaKit from 'astro-media-kit/integration'
 * export default defineConfig({
 *   integrations: [mediaKit()],
 * })
 * ```
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

	const video = config?.video ?? false
	const videoServices: Service[] =
		video === true
			? (['bunny', 'cloudflare', 'mux'] as Service[])
			: video === false
				? []
				: Array.isArray(video)
					? video
					: [video]

	return {
		hooks: {
			async 'astro:config:setup'({ updateConfig }) {
				if (videoServices.length > 0) {
					const { envField } = await import('astro/config')
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
					const { vitePluginMediaKitAutoImport } = await import('./auto-import')
					updateConfig({
						vite: {
							plugins: [vitePluginMediaKitAutoImport(resolvedComponentConfigs)],
						},
					})
				}

				if (aphexEnabled) {
					const { vitePluginMediaKitAphex } = await import('./aphex')
					updateConfig({
						vite: {
							// eslint-disable-next-line ts/no-unsafe-type-assertion -- return typed as unknown to avoid Vite type graph bloat in .d.ts
							plugins: [(await vitePluginMediaKitAphex(aphexConfig)) as never],
						},
					})
				}

				if (tldrawEnabled) {
					const { vitePluginMediaKitTldraw } = await import('./tldraw')
					updateConfig({
						vite: {
							// eslint-disable-next-line ts/no-unsafe-type-assertion -- return typed as unknown to avoid Vite type graph bloat in .d.ts
							plugins: [(await vitePluginMediaKitTldraw(tldrawConfig)) as never],
						},
					})
				}
			},
		},
		name: 'astro-media-kit',
	}
}
