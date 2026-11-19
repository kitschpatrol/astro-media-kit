// eslint-disable-next-line ts/ban-ts-comment -- `@ts-expect-error` would fail wherever the peer is installed
// @ts-ignore -- An optional peer: exact types where installed, `any` where not
import type tldrawVitePluginFn from '@kitschpatrol/unplugin-tldraw/vite'
import { importOptionalVitePlugin } from './optional-peer'

const getTldrawVitePlugin = (await importOptionalVitePlugin(
	'@kitschpatrol/unplugin-tldraw',
	'tldraw',
)) as () => typeof tldrawVitePluginFn

/** Options type extracted from the unplugin-tldraw Vite plugin function. */
type UnpluginTldrawOptions = NonNullable<Parameters<typeof tldrawVitePluginFn>[0]>

/**
 * Configuration for tldraw `.tldr` file support. Passes through to
 * `@kitschpatrol/unplugin-tldraw`.
 */
export type TldrawConfig = UnpluginTldrawOptions & {
	/**
	 * Enable tldraw `.tldr` file support.
	 *
	 * @default true
	 */
	enabled?: boolean
}

/**
 * Re-export defaultImageOptions type for convenience.
 */
export type TldrawImageOptions = NonNullable<UnpluginTldrawOptions['defaultImageOptions']>

/**
 * Creates the Vite plugin for `.tldr` file support. Uses
 * `@kitschpatrol/unplugin-tldraw`, an optional peer dependency, for conversion
 * and caching.
 *
 * @returns A Vite plugin (or array) for Astro's `updateConfig`.
 * @throws {Error} When `@kitschpatrol/unplugin-tldraw` is not installed.
 */
// Return type is Plugin[] but we use unknown to avoid TS2742 non-portable Vite type references
// and to prevent Vite's transitive type graph (postcss, rollup) from bloating the .d.ts output
export function vitePluginMediaKitTldraw(config: TldrawConfig): unknown {
	const { enabled: _, ...pluginOptions } = config
	return getTldrawVitePlugin()(pluginOptions)
}
