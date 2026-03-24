/* eslint-disable ts/naming-convention */
import type { AstroIntegration } from 'astro'
import type { AphexConfig } from './aphex.js'
import type { AutoImportConfig, AutoImportEntry, AutoImportPluginConfig } from './auto-import.js'
import type { TldrawConfig } from './tldraw.js'

export type { AphexConfig } from './aphex.js'
export type { AutoImportConfig, AutoImportEntry, AutoImportPluginConfig } from './auto-import.js'
export { tldrawDarkImport, transformAstroSource } from './auto-import.js'
export type { TldrawConfig } from './tldraw.js'
export type { TldrawImageOptions } from './tldraw.js'

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

	return {
		hooks: {
			async 'astro:config:setup'({ updateConfig }) {
				if (autoImportEnabled) {
					const { vitePluginMediaKitAutoImport } = await import('./auto-import.js')
					updateConfig({
						vite: {
							plugins: [vitePluginMediaKitAutoImport(resolvedComponentConfigs)],
						},
					})
				}

				if (aphexEnabled) {
					const { vitePluginMediaKitAphex } = await import('./aphex.js')
					updateConfig({
						vite: {
							// eslint-disable-next-line ts/no-unsafe-type-assertion -- return typed as unknown to avoid Vite type graph bloat in .d.ts
							plugins: [(await vitePluginMediaKitAphex(aphexConfig)) as never],
						},
					})
				}

				if (tldrawEnabled) {
					const { vitePluginMediaKitTldraw } = await import('./tldraw.js')
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
