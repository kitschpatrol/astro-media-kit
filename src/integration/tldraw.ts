import type { TldrawToImageOptions } from '@kitschpatrol/tldraw-cli'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Image conversion options for `.tldr` exports.
 * Subset of `@kitschpatrol/tldraw-cli` options relevant to image output.
 */
export type TldrawImageOptions = Pick<
	TldrawToImageOptions,
	'format' | 'padding' | 'scale' | 'stripStyle' | 'transparent'
>

/**
 * Configuration for tldraw `.tldr` file support.
 */
export type TldrawConfig = {
	/**
	 * Automatically generate dark mode variants for `.tldr` imports.
	 * When enabled, `.tldr` imports return a `{ dark, light }` object
	 * that `<Picture>` uses for `prefers-color-scheme` media queries.
	 * `<Image>` gracefully uses just the light variant.
	 * @default true
	 */
	autoDarkMode?: boolean
	/**
	 * Enable caching of generated image files in Vite's cache directory.
	 * Cache keys include a hash of the `.tldr` file content and image options,
	 * so cached files are automatically invalidated when the source changes.
	 * @default true
	 */
	cacheEnabled?: boolean
	/**
	 * Default image conversion options for all `.tldr` imports.
	 */
	defaultImageOptions?: TldrawImageOptions
	/**
	 * Enable tldraw `.tldr` file support.
	 * @default true
	 */
	enabled?: boolean
	/**
	 * Log conversion details to the console.
	 * @default false
	 */
	verbose?: boolean
}

type ResolvedTldrawConfig = {
	autoDarkMode: boolean
	cacheEnabled: boolean
	defaultImageOptions: Pick<TldrawImageOptions, 'padding' | 'scale'> &
		Required<Pick<TldrawImageOptions, 'format' | 'stripStyle' | 'transparent'>>
	verbose: boolean
}

function resolveConfig(config: TldrawConfig): ResolvedTldrawConfig {
	return {
		autoDarkMode: config.autoDarkMode ?? true,
		cacheEnabled: config.cacheEnabled ?? true,
		defaultImageOptions: {
			format: 'svg',
			stripStyle: false,
			transparent: false,
			...stripUndefined(config.defaultImageOptions),
		},
		verbose: config.verbose ?? false,
	}
}

/**
 * Vite plugin that converts `.tldr` file imports to generated SVG/PNG images.
 *
 * Uses the `load` hook to intercept `.tldr` file loads and return a module
 * that re-exports from the generated image file(s). When `autoDarkMode` is
 * enabled (default), generates both light and dark variants and exports a
 * `{ dark, light }` object compatible with `<Picture>`'s dark mode support.
 *
 * Astro's `astro:assets:esm` plugin picks up each image import and produces
 * proper `ImageMetadata`, making `.tldr` files work with both `<Image>` and
 * `<Picture>` components.
 *
 * Conversion is performed by `@kitschpatrol/tldraw-cli` which uses Puppeteer
 * under the hood (expect ~1-2s per conversion, hence the aggressive caching).
 */
export function vitePluginMediaKitTldraw(config: TldrawConfig) {
	const resolved = resolveConfig(config)
	let cacheDirectory = ''

	return {
		async configResolved(viteConfig: { cacheDir: string }) {
			cacheDirectory = path.join(viteConfig.cacheDir, 'astro-media-kit-tldr')

			if (!resolved.cacheEnabled) {
				await fs.rm(cacheDirectory, { force: true, recursive: true })
			}
		},
		enforce: 'pre' as const,
		async load(id: string) {
			const cleanId = id.replace(/\?.*$/, '')
			if (!cleanId.endsWith('.tldr')) return

			const lightPath = await convertTldr(cleanId, false, resolved, cacheDirectory)

			if (resolved.autoDarkMode) {
				const darkPath = await convertTldr(cleanId, true, resolved, cacheDirectory)

				const lightImport = asImageImport(lightPath, resolved.defaultImageOptions.format)
				const darkImport = asImageImport(darkPath, resolved.defaultImageOptions.format)

				return [
					`import light from ${JSON.stringify(lightImport)};`,
					`import dark from ${JSON.stringify(darkImport)};`,
					`export default { dark, light };`,
				].join('\n')
			}

			const importPath = asImageImport(lightPath, resolved.defaultImageOptions.format)
			return `export { default } from ${JSON.stringify(importPath)}`
		},
		name: 'astro-media-kit:tldraw',
	}
}

/**
 * Converts a `.tldr` file to an image, with caching.
 * @returns Absolute path to the generated image file.
 */
async function convertTldr(
	tldrPath: string,
	dark: boolean,
	resolved: ResolvedTldrawConfig,
	cacheDirectory: string,
): Promise<string> {
	const { format } = resolved.defaultImageOptions
	const optionsForHash = { ...resolved.defaultImageOptions, dark }
	const cacheKey = await computeCacheKey(tldrPath, optionsForHash)
	const suffix = dark ? '-dark' : ''
	const cachedFileName = `${path.basename(tldrPath, '.tldr')}${suffix}-${cacheKey}.${format}`
	const cachedFilePath = path.join(cacheDirectory, cachedFileName)

	const cacheHit = resolved.cacheEnabled && (await fileExists(cachedFilePath))

	if (cacheHit) {
		if (resolved.verbose) {
			logInfo(`Cache hit for "${path.relative(process.cwd(), tldrPath)}"${dark ? ' (dark)' : ''}`)
		}

		return cachedFilePath
	}

	if (resolved.verbose) {
		logInfo(`Converting "${path.relative(process.cwd(), tldrPath)}"${dark ? ' (dark)' : ''}...`)
	}

	const startTime = performance.now()
	await fs.mkdir(cacheDirectory, { recursive: true })

	const { tldrawToImage } = await import('@kitschpatrol/tldraw-cli')

	// Build options, omitting undefined values to satisfy exactOptionalPropertyTypes
	const imageOptions: TldrawToImageOptions = {
		dark,
		format,
		output: cacheDirectory,
		stripStyle: resolved.defaultImageOptions.stripStyle,
		transparent: resolved.defaultImageOptions.transparent,
	}

	if (resolved.defaultImageOptions.padding !== undefined) {
		imageOptions.padding = resolved.defaultImageOptions.padding
	}

	if (resolved.defaultImageOptions.scale !== undefined) {
		imageOptions.scale = resolved.defaultImageOptions.scale
	}

	const outputFiles = await tldrawToImage(tldrPath, imageOptions)
	const outputFile = outputFiles[0]

	if (!outputFile) {
		throw new Error(`tldraw-cli produced no output for "${tldrPath}"`)
	}

	// Rename to include our cache hash (tldrawToImage uses source filename)
	if (outputFile !== cachedFilePath) {
		await fs.rename(outputFile, cachedFilePath)
	}

	if (resolved.verbose) {
		const elapsed = Math.round(performance.now() - startTime)
		logInfo(`Converted in ${elapsed}ms → "${cachedFileName}"`)
	}

	return cachedFilePath
}

/**
 * Wraps a file path for import. SVGs get the `astroContentImageFlag` query
 * to tell Astro's `astro:assets:esm` plugin to emit metadata proxies
 * (like content collection images) rather than inline SVG components.
 */
function asImageImport(filePath: string, format: string): string {
	return format === 'svg' ? `${filePath}?astroContentImageFlag` : filePath
}

async function computeCacheKey(
	filePath: string,
	options: Record<string, unknown>,
): Promise<string> {
	const fileBuffer = await fs.readFile(filePath)
	const hash = crypto.createHash('sha1')
	hash.update(fileBuffer)
	hash.update(JSON.stringify(options))
	return hash.digest('hex').slice(0, 8)
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

function logInfo(message: string): void {
	console.log(`[astro-media-kit:tldraw] ${message}`)
}

function stripUndefined(object: Record<string, unknown> | undefined): Record<string, unknown> {
	if (object === undefined) return {}
	return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined))
}
