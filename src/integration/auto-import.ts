import type { AttributeNode, ComponentNode, FrontmatterNode, Node } from '@astrojs/compiler/types'
import { parse } from '@astrojs/compiler'
import { is, serialize } from '@astrojs/compiler/utils'
import { readFile } from 'node:fs/promises'

/**
 * A single auto-import entry describing how a prop value should be imported as
 * an ESM module.
 *
 * - `string` — The prop name to import (e.g. `'src'`). Replaces the string value
 *   in-place.
 * - `{ from, to }` — Read from `from` prop, import it, set on `to` prop.
 * - `{ from, to, transform }` — Like above, but transform the path first. Return
 *   `undefined` from `transform` to skip the derived import.
 */
export type AutoImportEntry =
	| string
	| {
			from: string
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

const TLDRAW_EXTENSION_REGEX = /\.tldr(?:\?|$)/

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
		if (!TLDRAW_EXTENSION_REGEX.test(path)) return
		return `${path}${path.includes('?') ? '&' : '?'}dark=true&tldr`
	},
}

type ImportEntry = {
	name: string
	path: string
}

function isImportablePath(path: string): boolean {
	return !path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('data:')
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
): boolean {
	const existingProps = new Set(node.attributes.map((attribute) => attribute.name))

	const primaryEntries = entries.filter((entry) => !entry.transform)
	const derivedEntries = entries.filter((entry) => entry.transform)

	if (primaryEntries.length === 0) return false

	// Use the first primary entry's value as the anchor path for derived entries
	const anchorEntry = primaryEntries[0]!
	const anchorAttribute = findQuotedAttribute(node.attributes, anchorEntry.fromProp)
	if (!anchorAttribute || !isImportablePath(anchorAttribute.value)) return false

	const anchorPath = anchorAttribute.value
	let modified = false

	// Process primary entries — replace quoted string attrs with expression imports
	for (const entry of primaryEntries) {
		const attribute = findQuotedAttribute(node.attributes, entry.fromProp)
		if (!attribute || !isImportablePath(attribute.value)) continue

		const importEntry = getOrCreateImport(imports, attribute.value)

		if (entry.fromProp === entry.toProp) {
			// In-place: src="./foo.png" → src={__ami_0}
			attribute.kind = 'expression'
			attribute.value = importEntry.name
		} else {
			// Remap: keep original string attr, add new expression attr
			node.attributes.push(makeExpressionAttribute(entry.toProp, importEntry.name))
		}

		modified = true
	}

	// Process derived entries — use anchor path + transform to generate new props
	for (const entry of derivedEntries) {
		if (existingProps.has(entry.toProp)) {
			// Prop already exists — import its value if it's a quoted string
			const attribute = findQuotedAttribute(node.attributes, entry.toProp)
			if (attribute && isImportablePath(attribute.value)) {
				const importEntry = getOrCreateImport(imports, attribute.value)
				attribute.kind = 'expression'
				attribute.value = importEntry.name
				modified = true
			}
		} else {
			// Derive from anchor path via transform
			const transformedPath = entry.transform!(anchorPath)
			if (transformedPath === undefined) continue

			const importEntry = getOrCreateImport(imports, transformedPath)
			node.attributes.push(makeExpressionAttribute(entry.toProp, importEntry.name))
			modified = true
		}
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
 * generated imports), then serializes the modified AST back to source.
 *
 * @returns The transformed source, or `undefined` if no changes were needed.
 */
export async function transformAstroSource(
	source: string,
	componentConfigs: Record<string, ResolvedEntry[]>,
): Promise<string | undefined> {
	const { ast } = await parse(source)

	let frontmatterNode: FrontmatterNode | undefined
	const imports = new Map<string, ImportEntry>()
	let modified = false

	walkNodes(ast, (node) => {
		if (is.frontmatter(node)) {
			frontmatterNode = node
		}

		if (is.component(node)) {
			const entries = componentConfigs[node.name]
			if (entries && processComponent(node, entries, imports)) {
				modified = true
			}
		}
	})

	// eslint-disable-next-line ts/no-unnecessary-condition
	if (!frontmatterNode || !modified) return undefined

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
export function vitePluginMediaKitAutoImport(componentConfigs: Record<string, ResolvedEntry[]>) {
	return {
		enforce: 'pre' as const,
		async load(id: string) {
			if (!id.endsWith('.astro')) return
			const source = await readFile(id, 'utf8')
			const result = await transformAstroSource(source, componentConfigs)
			if (result === undefined) return
			return { code: result, map: undefined }
		},
		name: 'astro-media-kit:auto-import',
	}
}
