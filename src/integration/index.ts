import type { AstroIntegration } from 'astro'
import type { AphexConfig } from './aphex.js'
import type { AutoImportConfig } from './auto-import.js'
import type { TldrawConfig } from './tldraw.js'

export type { AphexConfig } from './aphex.js'
export type { AutoImportConfig } from './auto-import.js'
export { transformAstroSource } from './auto-import.js'
export type { TldrawConfig, TldrawImageOptions } from './tldraw.js'

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
	 * Set to `false` to disable, or pass an object to customize.
	 * @default true
	 */
	autoImport?: AutoImportConfig | boolean
	/**
	 * Enable tldraw `.tldr` file support via `@kitschpatrol/tldraw-cli`.
	 * When enabled, `.tldr` file imports are converted to SVG/PNG images
	 * and fed into Astro's image pipeline, working with both `<Image>`
	 * and `<Picture>` components.
	 * Set to `true` for defaults, `false` to disable, or pass an object to customize.
	 * @default false
	 */
	tldraw?: boolean | TldrawConfig
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
	const componentNames =
		typeof autoImport === 'object'
			? (autoImport.components ?? ['Image', 'Picture'])
			: ['Image', 'Picture']

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
							plugins: [vitePluginMediaKitAutoImport(componentNames)],
						},
					})
				}

				if (aphexEnabled) {
					const { vitePluginMediaKitAphex } = await import('./aphex.js')
					updateConfig({
						vite: {
							plugins: [await vitePluginMediaKitAphex(aphexConfig)],
						},
					})
				}

				if (tldrawEnabled) {
					const { vitePluginMediaKitTldraw } = await import('./tldraw.js')
					updateConfig({
						vite: {
							plugins: [vitePluginMediaKitTldraw(tldrawConfig)],
						},
					})
				}
			},
		},
		name: 'astro-media-kit',
	}
}
