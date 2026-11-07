import type { AstroConfig } from 'astro'
import { parse } from '@astrojs/compiler-rs'
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

function resolveEntry(entry: AutoImportEntry): ResolvedEntry {
	if (typeof entry === 'string') {
		return { fromProp: entry, toProp: entry }
	}

	return {
		fromProp: entry.from,
		toProp: entry.to,
		...(entry.shouldImport && { shouldImport: entry.shouldImport }),
		...(entry.transform && { transform: entry.transform }),
	}
}

/** Each component's entries, normalized from the shapes the config accepts. */
function resolveComponentEntries(
	components: Record<string, AutoImportConfig>,
): Record<string, ResolvedEntry[]> {
	return Object.fromEntries(
		Object.entries(components).map(([name, config]) => [
			name,
			(Array.isArray(config) ? config : [config]).map((entry) => resolveEntry(entry)),
		]),
	)
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

/** The parts of the compiler's ESTree-style AST the transform reads. */
type Span = { start: number; end: number }
type AstNode = Span & { type: string }
type JsxAttribute = AstNode & {
	name: AstNode & { name?: string }
	type: 'JSXAttribute'
	/** Null in the AST for a bare attribute. */
	value?: AstNode & { raw?: string }
}
type JsxOpeningElement = AstNode & {
	attributes: AstNode[]
	name: AstNode & { name?: string }
	type: 'JSXOpeningElement'
}

/** A component attribute as the entries see it. */
type Attribute = {
	kind: 'expression' | 'quoted'
	name: string
	node: JsxAttribute
	/** The quoted text as written, without its quotes. */
	value: string
}

/** A replacement of `[start, end)` in the source; an insertion when empty. */
type Edit = Span & { text: string }

function isJsxAttribute(node: AstNode): node is JsxAttribute {
	return node.type === 'JSXAttribute'
}

/**
 * Every opening tag in the tree, including those inside expressions.
 *
 * @yields {JsxOpeningElement} Each opening tag, in document order.
 */
function* openingElements(node: unknown): Generator<JsxOpeningElement> {
	if (node === null || typeof node !== 'object') {
		return
	}

	if (Array.isArray(node)) {
		for (const child of node) {
			yield* openingElements(child)
		}

		return
	}

	const record = node as Record<string, unknown>
	if (record.type === 'JSXOpeningElement') {
		yield record as JsxOpeningElement
	}

	for (const value of Object.values(record)) {
		if (typeof value === 'object') {
			yield* openingElements(value)
		}
	}
}

/** The named attributes of a tag: quoted ones with their text, others by kind. */
function attributesOf(element: JsxOpeningElement): Attribute[] {
	const attributes: Attribute[] = []
	for (const node of element.attributes) {
		if (!isJsxAttribute(node) || node.name.name === undefined) {
			continue
		}

		const { raw } = node.value ?? {}
		attributes.push(
			raw !== undefined && node.value?.type === 'Literal'
				? { kind: 'quoted', name: node.name.name, node, value: raw.slice(1, -1) }
				: { kind: 'expression', name: node.name.name, node, value: '' },
		)
	}

	return attributes
}

/**
 * Collect the imports a tag needs, and the edits that refer to them: a quoted
 * value becomes an expression in place, and a prop the tag lacks is added after
 * its last attribute.
 */
function processComponent(
	element: JsxOpeningElement,
	entries: ResolvedEntry[],
	imports: Map<string, ImportEntry>,
	directories: ImportDirectories | undefined,
	edits: Edit[],
): void {
	const attributes = attributesOf(element)
	const orderedEntries = [
		...entries.filter((entry) => !entry.transform),
		...entries.filter((entry) => entry.transform),
	]
	// A later entry for the same prop replaces what an earlier one decided
	const rewrites = new Map<JsxAttribute, string>()
	const additions = new Map<string, string>()

	for (const entry of orderedEntries) {
		const target = attributes.find((attribute) => attribute.name === entry.toProp)
		// Explicit target props win over remapped or generated values.
		const attribute =
			target ??
			attributes.find(
				(candidate) => candidate.name === entry.fromProp && candidate.kind === 'quoted',
			)
		if (attribute?.kind !== 'quoted' || !isImportable(entry, attribute.value, directories)) {
			continue
		}

		const importPath =
			target && entry.fromProp !== entry.toProp
				? attribute.value
				: entry.transform
					? entry.transform(attribute.value)
					: attribute.value
		if (importPath === undefined || !isImportablePath(importPath, directories)) {
			continue
		}

		const importEntry = getOrCreateImport(imports, importPath)
		if (target === undefined) {
			additions.set(entry.toProp, importEntry.name)
		} else {
			rewrites.set(target.node, importEntry.name)
		}
	}

	for (const [attribute, name] of rewrites) {
		const value = attribute.value!
		edits.push({ end: value.end, start: value.start, text: `{${name}}` })
	}

	if (additions.size === 0) {
		return
	}

	const { end } = element.attributes.at(-1) ?? element.name
	const text = Array.from(additions, ([prop, name]) => ` ${prop}={${name}}`).join('')
	edits.push({ end, start: end, text })
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
 * Parses the source with `@astrojs/compiler-rs`, the compiler Astro itself
 * uses, then splices the imports and the rewritten attributes into the original
 * source by position, leaving its formatting as it was.
 *
 * @param source - The `.astro` file's source.
 * @param components - Component names mapped to their auto-import entries, as
 *   the integration's `autoImport.components` option takes them.
 * @param directories - Astro's resolved `root` and `publicDir`, which tell Vite
 *   root imports from public URLs; the integration supplies them
 *   automatically.
 *
 * @returns The transformed source, or `undefined` if no changes were needed,
 *   including when the source does not parse, which Astro reports itself.
 */
export function transformAstroSource(
	source: string,
	components: Record<string, AutoImportConfig>,
	directories?: ImportDirectories,
): string | undefined {
	return transformWithEntries(source, resolveComponentEntries(components), directories)
}

function transformWithEntries(
	source: string,
	componentEntries: Record<string, ResolvedEntry[]>,
	directories: ImportDirectories | undefined,
): string | undefined {
	type AstroRoot = AstNode & { frontmatter: Span & { program: Span } }
	const { ast, diagnostics } = parse(source)
	if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
		return undefined
	}

	const root = ast as AstroRoot
	const imports = new Map<string, ImportEntry>()
	const edits: Edit[] = []
	for (const element of openingElements(root)) {
		const entries =
			element.name.name === undefined ? undefined : componentEntries[element.name.name]
		if (entries) {
			processComponent(element, entries, imports, directories, edits)
		}
	}

	// Every edit refers to an import, so none means no change
	if (imports.size === 0) {
		return undefined
	}

	const importStatements = Array.from(
		imports.values(),
		(entry) => `import ${entry.name} from ${JSON.stringify(entry.path)}`,
	).join('\n')

	// Later edits first, so earlier positions stay valid
	let result = source
	const ordered = edits.toSorted((a, b) => b.start - a.start)
	for (const edit of ordered) {
		result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`
	}

	// A file without frontmatter gets one to hold the imports; otherwise they
	// go before the closing fence
	const { frontmatter } = root
	if (frontmatter.end === 0) {
		return `---\n${importStatements}\n---\n\n${result}`
	}

	const fence = frontmatter.end - 3
	const at = source.startsWith('---', fence) ? fence : frontmatter.program.end
	return `${result.slice(0, at)}${importStatements}\n${result.slice(at)}`
}

/**
 * Vite plugin that applies the auto-import transform to `.astro` files.
 *
 * Uses the `load` hook to intercept raw `.astro` source before Astro's own
 * compiler transforms it to JavaScript.
 */
export function vitePluginMediaKitAutoImport(
	components: Record<string, AutoImportConfig>,
	directories: ImportDirectories,
) {
	const componentEntries = resolveComponentEntries(components)
	return {
		enforce: 'pre' as const,
		async load(id: string) {
			if (!id.endsWith('.astro')) {
				return
			}

			const source = await readFile(id, 'utf8')
			const result = transformWithEntries(source, componentEntries, directories)
			if (result === undefined) {
				return
			}

			return { code: result, map: undefined }
		},
		name: 'astro-media-kit:auto-import',
	}
}
