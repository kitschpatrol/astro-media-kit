import type { AstroIntegration } from 'astro'

const FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\n?---/

/**
 * Auto-import configuration for the media-kit integration.
 */
export type AutoImportConfig = {
	/**
	 * Component names whose `src` and `srcDark` string props should be
	 * auto-imported. Defaults to `['Image', 'Picture']`.
	 */
	components?: string[]
	/**
	 * Enable auto-importing of image assets in `.astro` files.
	 * When enabled, static string `src` and `srcDark` props are
	 * automatically rewritten to imported variables.
	 * @default true
	 */
	enabled?: boolean
}

/**
 * Configuration for the astro-media-kit integration.
 */
export type MediaKitConfig = {
	/**
	 * Configure auto-importing of image assets in `.astro` files.
	 * Set to `false` to disable, or pass an object to customize.
	 * @default true
	 */
	autoImport?: AutoImportConfig | boolean
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
	const autoImport = config?.autoImport ?? true
	const autoImportEnabled = autoImport !== false && (autoImport === true || autoImport.enabled !== false)
	const componentNames =
		typeof autoImport === 'object' ? (autoImport.components ?? ['Image', 'Picture']) : ['Image', 'Picture']

	return {
		hooks: {
			'astro:config:setup'({ updateConfig }) {
				if (autoImportEnabled) {
					updateConfig({
						vite: {
							plugins: [vitePluginMediaKitAutoImport(componentNames)],
						},
					})
				}
			},
		},
		name: 'astro-media-kit',
	}
}

type ImportEntry = {
	name: string
	path: string
}

/**
 * Transforms `.astro` source to auto-import image assets for media-kit components.
 * Scans for `<Image src="path" />` and `<Picture srcDark="path" />`
 * patterns, injects corresponding import statements into the frontmatter,
 * and rewrites the string attributes to use imported variables.
 * @returns The transformed source, or `undefined` if no changes were needed.
 */
export function transformAstroSource(
	source: string,
	componentNames: string[],
): string | undefined {
	const frontmatterMatch = FRONTMATTER_REGEX.exec(source)
	if (!frontmatterMatch) return undefined

	const frontmatterEnd = frontmatterMatch.index + frontmatterMatch[0].length
	const templateSection = source.slice(frontmatterEnd)

	const imports = new Map<string, ImportEntry>()
	const replacements: Array<{ end: number; newValue: string; start: number }> = []

	const componentNamesPattern = componentNames.join('|')

	// Match opening tags for target components (handles multiline and self-closing)
	const componentTagRegex = new RegExp(
		String.raw`<(?:${componentNamesPattern})\b([\s\S]*?)(/?>)`,
		'g',
	)

	let tagMatch: RegExpExecArray | undefined
	while ((tagMatch = componentTagRegex.exec(templateSection) ?? undefined) !== undefined) {
		const tagContent = tagMatch[1]
		if (!tagContent) continue

		// Position of the tag's attribute content within the full source
		const tagContentStart = frontmatterEnd + tagMatch.index + tagMatch[0].indexOf(tagContent)

		// Find src="..." and srcDark="..." within this tag
		const attributeRegex = /\b(src|srcDark)=(?:"([^"]+)"|'([^']+)')/g
		let attributeMatch: RegExpExecArray | undefined
		while (
			(attributeMatch = attributeRegex.exec(tagContent) ?? undefined) !== undefined
		) {
			const attributeName = attributeMatch[1]!
			const importPath = attributeMatch[2] ?? attributeMatch[3]
			if (!importPath) continue

			if (
				importPath.startsWith('http://') ||
				importPath.startsWith('https://') ||
				importPath.startsWith('data:')
			) {
				continue
			}

			let entry = imports.get(importPath)
			if (!entry) {
				entry = {
					name: `__ami_${imports.size}`,
					path: importPath,
				}
				imports.set(importPath, entry)
			}

			const attributeValueStart = tagContentStart + attributeMatch.index
			const attributeValueEnd = attributeValueStart + attributeMatch[0].length

			replacements.push({
				end: attributeValueEnd,
				newValue: `${attributeName}={${entry.name}}`,
				start: attributeValueStart,
			})
		}
	}

	if (replacements.length === 0) return undefined

	const importStatements = [...imports.values()]
		.map((entry) => `import ${entry.name} from ${JSON.stringify(entry.path)}`)
		.join('\n')

	// Apply replacements from end to start to preserve positions
	let result = source
	for (const replacement of replacements.toReversed()) {
		result =
			result.slice(0, replacement.start) + replacement.newValue + result.slice(replacement.end)
	}

	// Inject imports before the closing ---
	const insertPoint = frontmatterEnd - 3
	result =
		result.slice(0, insertPoint) + importStatements + '\n' + result.slice(insertPoint)

	return result
}

/**
 * Vite plugin that applies the auto-import transform to `.astro` files.
 */
function vitePluginMediaKitAutoImport(componentNames: string[]) {
	return {
		enforce: 'pre' as const,
		name: 'astro-media-kit:auto-import',
		transform: {
			filter: {
				id: /\.astro$/,
			},
			handler(source: string) {
				const result = transformAstroSource(source, componentNames)
				if (result === undefined) return
				return { code: result, map: undefined }
			},
		},
	}
}
