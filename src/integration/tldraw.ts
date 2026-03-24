import type tldrawVitePluginFn from '@kitschpatrol/unplugin-tldraw/vite'

/** Options type extracted from the unplugin-tldraw Vite plugin function. */
type UnpluginTldrawOptions = NonNullable<Parameters<typeof tldrawVitePluginFn>[0]>

/**
 * Configuration for tldraw `.tldr` file support.
 * Passes through to `@kitschpatrol/unplugin-tldraw`.
 */
export type TldrawConfig = UnpluginTldrawOptions & {
	/**
	 * Enable tldraw `.tldr` file support.
	 * @default true
	 */
	enabled?: boolean
}

/**
 * Re-export defaultImageOptions type for convenience.
 */
export type TldrawImageOptions = NonNullable<UnpluginTldrawOptions['defaultImageOptions']>

/**
 * Creates the Vite plugin for `.tldr` file support.
 * Uses `@kitschpatrol/unplugin-tldraw` for conversion and caching,
 * wrapped with Astro-specific handling for SVG ImageMetadata.
 * @returns A Vite plugin array for Astro's `updateConfig`.
 */
// Return type is Plugin[] but we use unknown to avoid TS2742 non-portable Vite type references
// and to prevent Vite's transitive type graph (postcss, rollup) from bloating the .d.ts output
export async function vitePluginMediaKitTldraw(config: TldrawConfig): Promise<unknown> {
	const { enabled: _, ...pluginOptions } = config
	const { default: tldrawVitePlugin } = await import('@kitschpatrol/unplugin-tldraw/vite')
	const tldrawPlugin = tldrawVitePlugin(pluginOptions)
	const plugins = Array.isArray(tldrawPlugin) ? tldrawPlugin : [tldrawPlugin]

	// Intercept .tldr imports BEFORE unplugin-tldraw, delegate to it,
	// then append ?astroContentImageFlag to SVG results so Astro emits
	// ImageMetadata instead of inline SVG components.
	const wrapperPlugin = {
		enforce: 'pre' as const,
		name: 'astro-media-kit:tldraw',
		resolveId: {
			filter: { id: /\.tldr/ },
			async handler(
				this: {
					resolve: (
						id: string,
						importer?: string,
						options?: Record<string, unknown>,
						// eslint-disable-next-line ts/no-restricted-types
					) => Promise<null | { id: string }>
				},
				id: string,
				importer: string | undefined,
				options: Record<string, unknown>,
			) {
				const resolved = await this.resolve(id, importer, {
					...options,
					skipSelf: true,
				})

				if (!resolved) return

				if (resolved.id.endsWith('.svg')) {
					return `${resolved.id}?astroContentImageFlag`
				}

				return resolved
			},
		},
	}

	return [wrapperPlugin, ...plugins]
}
