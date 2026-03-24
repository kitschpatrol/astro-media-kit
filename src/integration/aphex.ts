import type { Options as UnpluginAphexOptions } from '@kitschpatrol/unplugin-aphex/vite'

/**
 * Configuration for Apple Photos (`~aphex/`) import support.
 * Passes through to `@kitschpatrol/unplugin-aphex`.
 */
export type AphexConfig = {
	/**
	 * Enable Apple Photos `~aphex/` import support.
	 * @default true
	 */
	enabled?: boolean
} & Omit<UnpluginAphexOptions, 'returnMetadata'>

/**
 * Creates the Vite plugin for `~aphex/` Apple Photos imports.
 * Wraps `@kitschpatrol/unplugin-aphex/vite` with defaults suitable
 * for Astro's image pipeline (always returns file paths, not metadata).
 * @returns A Vite plugin (or array of plugins) for Astro's `updateConfig`.
 */
export async function vitePluginMediaKitAphex(
	config: AphexConfig,
	// TS2742: inferred return references non-portable Vite paths from unplugin-aphex's node_modules
): Promise<unknown> {
	const { enabled: _, ...pluginOptions } = config
	const { default: aphexVitePlugin } = await import('@kitschpatrol/unplugin-aphex/vite')
	return aphexVitePlugin({
		...pluginOptions,
		// Always return file paths so Astro's image pipeline can produce ImageMetadata
		returnMetadata: false,
	})
}
