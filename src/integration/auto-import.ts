import type { AttributeNode, ComponentNode, FrontmatterNode, Node } from '@astrojs/compiler/types'
import type { AstroConfig } from 'astro'
import { parse } from '@astrojs/compiler'
import { is, serialize } from '@astrojs/compiler/utils'
import { statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import nodePath from 'node:path'
import { fileURLToPath } from 'node:url'
import { tryParseUrl } from '../components/utils/media'
import { isVideoSource } from '../components/utils/video'

/**
 * A single auto-import entry describing how a prop value should be imported as
 * an ESM module.
 *
 * - `string` — The prop name to import (e.g. `'src'`). Replaces the string value
 *   in-place.
 * - `{ from, to }` — Read from `from` prop, import it, set on `to` prop.
 * - `{ from, to, transform }` — Like above, but transform the path first. Return
 *   `undefined` from `transform` to skip the derived import.
 * - `{ from, to, shouldImport }` — Like `{ from, to }`, but leave values that
 *   `shouldImport` declines as they are.
 */
export type AutoImportEntry =
	| string
	| {
			from: string
			/**
			 * Whether a string value should be imported at all. Every importable path
			 * is, by default.
			 */
			shouldImport?: (path: string) => boolean
			to: string
			/**
			 * Transform the import path before generating the import. Return
			 * `undefined` to skip.
			 */
			transform?: (path: string) => string | undefined
	  }

/**
 * Auto-import configuration: a single entry or array of entries.
 */
export type AutoImportConfig = AutoImportEntry | AutoImportEntry[]

/**
 * Resolved auto-import entry with normalized prop names.
 */
type ResolvedEntry = {
	fromProp: string
	shouldImport?: (path: string) => boolean
	toProp: string
	transform?: (path: string) => string | undefined
}

/**
 * Configuration for the auto-import Vite plugin.
 */
export type AutoImportPluginConfig = {
	/**
	 * Map of component names to their auto-import entries.
	 *
	 * @example
	 * 	{Picture: ['src', tldrawDarkImport], Image: ['src']}
	 */
	components: Record<string, AutoImportConfig>
	/**
	 * Enable auto-importing of image assets in `.astro` files.
	 *
	 * @default true
	 */
	enabled?: boolean
}

const TLDRAW_EXTENSION_REGEX = /\.tldr(?:\?|$)/v
const QUERY_OR_HASH_REGEX = /[?#]/v

/**
 * Auto-import entry that generates a dark variant for `.tldr` files via
 * `@kitschpatrol/unplugin-tldraw`.
 *
 * @example
 * 	mediaKit({
 * 		autoImport: {
 * 			components: {
 * 				Picture: ['src', tldrawDarkImport],
 * 			},
 * 		},
 * 	})
 */
export const tldrawDarkImport: AutoImportEntry = {
	from: 'src',
	to: 'srcDark',
	transform(path: string) {
		if (!TLDRAW_EXTENSION_REGEX.test(path)) {
			return
		}

		return `${path}${path.includes('?') ? '&' : '?'}dark=true&tldr`
	},
}

/**
 * Auto-import entry for `<ZoomLink>`'s `src`: imported as an image unless it is
 * a video source, which the component takes as it is.
 *
 * @example
 * 	mediaKit({
 * 		autoImport: {
 * 			components: {
 * 				ZoomLink: imageOnlyImport,
 * 			},
 * 		},
 * 	})
 */
export const imageOnlyImport: AutoImportEntry = {
	from: 'src',
	shouldImport: (path) => !isVideoSource(path),
	to: 'src',
}

type ImportEntry = {
	name: string
	path: string
}

type ImportDirectories = Pick<AstroConfig, 'publicDir' | 'root'>

/** Whether `entry` imports a quoted `path`: not a URL, and not one it declines. */
function isImportable(
	entry: ResolvedEntry,
	path: string,
	directories: ImportDirectories | undefined,
): boolean {
	return isImportablePath(path, directories) && entry.shouldImport?.(path) !== false
}

function isImportablePath(path: string, directories: ImportDirectories | undefined): boolean {
	if (tryParseUrl(path) !== undefined || path.startsWith('//') || path.startsWith('data:')) {
		return false
	}

	if (!path.startsWith('/') || path.startsWith('/@fs/')) {
		return true
	}

	// Vite accepts /src/assets/photo.jpg as an import from the project root.
	// Public URLs share that syntax, and public files win when both exist.
	const pathname = path.split(QUERY_OR_HASH_REGEX, 1)[0]!
	if (directories !== undefined) {
		const publicFile = nodePath.join(fileURLToPath(directories.publicDir), pathname)
		if (statSync(publicFile, { throwIfNoEntry: false })?.isFile() === true) {
			return false
		}

		const rootFile = nodePath.join(fileURLToPath(directories.root), pathname)
		if (statSync(rootFile, { throwIfNoEntry: false })?.isFile() === true) {
			return true
		}
	}

	return statSync(pathname, { throwIfNoEntry: false })?.isFile() === true
}

function makeExpressionAttribute(name: string, value: string): AttributeNode {
	return {
		kind: 'expression',
		name,
		raw: '',
		type: 'attribute',
		value,
	}
}

function findQuotedAttribute(attributes: AttributeNode[], name: string): AttributeNode | undefined {
	return attributes.find((a) => a.name === name && a.kind === 'quoted')
}

function walkNodes(node: Node, visitor: (node: Node) => void): void {
	visitor(node)
	if ('children' in node) {
		for (const child of node.children) {
			walkNodes(child, visitor)
		}
	}
}

/**
 * Collect imports from a single component node, mutating its attributes in
 * place. Returns true if any attributes were modified.
 */
function processComponent(
	node: ComponentNode,
	entries: ResolvedEntry[],
	imports: Map<string, ImportEntry>,
	directories: ImportDirectories | undefined,
): boolean {
	// Read the original attributes: an earlier entry may already have rewritten
	// the source prop to an import expression.
	const attributes = node.attributes.map((attribute) => ({ ...attribute }))
	let modified = false
	const orderedEntries = [
		...entries.filter((entry) => !entry.transform),
		...entries.filter((entry) => entry.transform),
	]

	for (const entry of orderedEntries) {
		const target = node.attributes.find((attribute) => attribute.name === entry.toProp)
		const originalTarget = attributes.find((attribute) => attribute.name === entry.toProp)
		// Explicit target props win over remapped or generated values.
		const attribute = originalTarget ?? findQuotedAttribute(attributes, entry.fromProp)
		if (attribute?.kind !== 'quoted' || !isImportable(entry, attribute.value, directories)) {
			continue
		}

		const importPath =
			originalTarget && entry.fromProp !== entry.toProp
				? attribute.value
				: entry.transform
					? entry.transform(attribute.value)
					: attribute.value
		if (importPath === undefined || !isImportablePath(importPath, directories)) {
			continue
		}

		const importEntry = getOrCreateImport(imports, importPath)
		if (target) {
			target.kind = 'expression'
			target.value = importEntry.name
		} else {
			node.attributes.push(makeExpressionAttribute(entry.toProp, importEntry.name))
		}

		modified = true
	}

	return modified
}

function getOrCreateImport(imports: Map<string, ImportEntry>, importPath: string): ImportEntry {
	let entry = imports.get(importPath)
	if (!entry) {
		entry = { name: `__ami_${imports.size}`, path: importPath }
		imports.set(importPath, entry)
	}

	return entry
}

/**
 * Transforms `.astro` source to auto-import assets for configured components.
 *
 * Parses the AST with `@astrojs/compiler`, modifies component attributes
 * in-place (replacing quoted string props with expression references to
 * generated imports), then serializes the modified AST back to source. Pass the
 * resolved project directories to distinguish Vite root imports from public
 * URLs; the integration supplies them automatically.
 *
 * @returns The transformed source, or `undefined` if no changes were needed.
 */
export async function transformAstroSource(
	source: string,
	componentConfigs: Record<string, ResolvedEntry[]>,
	directories?: ImportDirectories,
): Promise<string | undefined> {
	const { ast } = await parse(source)

	let frontmatterNode: FrontmatterNode | undefined
	const imports = new Map<string, ImportEntry>()
	let modified = false

	walkNodes(ast, (node) => {
		if (is.frontmatter(node)) {
			frontmatterNode = node
		}

		if (!is.component(node)) {
			return
		}

		const entries = componentConfigs[node.name]
		if (entries && processComponent(node, entries, imports, directories)) {
			modified = true
		}
	})

	// eslint-disable-next-line ts/no-unnecessary-condition -- frontmatterNode is assigned inside the walkNodes callback; TS narrowing doesn't track callback writes.
	if (!frontmatterNode || !modified) {
		return undefined
	}

	// Append import statements to frontmatter
	const importStatements = Array.from(
		imports.values(),
		(entry) => `import ${entry.name} from ${JSON.stringify(entry.path)}`,
	).join('\n')

	frontmatterNode.value += `${importStatements}\n`

	return serialize(ast)
}

/**
 * Vite plugin that applies the auto-import transform to `.astro` files.
 *
 * Uses the `load` hook to intercept raw `.astro` source before Astro's own
 * compiler transforms it to JavaScript.
 */
export function vitePluginMediaKitAutoImport(
	componentConfigs: Record<string, ResolvedEntry[]>,
	directories: ImportDirectories,
) {
	return {
		enforce: 'pre' as const,
		async load(id: string) {
			if (!id.endsWith('.astro')) {
				return
			}

			const source = await readFile(id, 'utf8')
			const result = await transformAstroSource(source, componentConfigs, directories)
			if (result === undefined) {
				return
			}

			return { code: result, map: undefined }
		},
		name: 'astro-media-kit:auto-import',
	}
}
