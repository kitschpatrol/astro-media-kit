import type aphexVitePluginFn from '@kitschpatrol/unplugin-aphex/vite'
import aphexVitePlugin from '@kitschpatrol/unplugin-aphex/vite'

/** Options type extracted from the unplugin-aphex Vite plugin function. */
type UnpluginAphexOptions = NonNullable<Parameters<typeof aphexVitePluginFn>[0]>

/**
 * Configuration for Apple Photos (`~aphex/`) import support. Passes through to
 * `@kitschpatrol/unplugin-aphex`.
 */
export type AphexConfig = Omit<UnpluginAphexOptions, 'returnMetadata'> & {
	/**
	 * Enable Apple Photos `~aphex/` import support.
	 *
	 * @default true
	 */
	enabled?: boolean
}

/**
 * Creates the Vite plugin for `~aphex/` Apple Photos imports. Wraps
 * `@kitschpatrol/unplugin-aphex/vite` with defaults suitable for Astro's image
 * pipeline (always returns file paths, not metadata).
 *
 * @returns A Vite plugin (or array of plugins) for Astro's `updateConfig`.
 */
export function vitePluginMediaKitAphex(
	config: AphexConfig,
	// TS2742: inferred return references non-portable Vite paths from unplugin-aphex's node_modules
): unknown {
	const { enabled: _, ...pluginOptions } = config
	return aphexVitePlugin({
		...pluginOptions,
		// Always return file paths so Astro's image pipeline can produce ImageMetadata
		returnMetadata: false,
	})
}
