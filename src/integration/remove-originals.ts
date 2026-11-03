import type { AstroConfig, AstroIntegrationLogger } from 'astro'
import type { Dirent } from 'node:fs'
import { parseHTML } from 'linkedom'
import { readdir, readFile, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Image formats that may be emitted as originals by Astro's image pipeline. */
const ORIGINAL_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'svg'] as const

/** Valid characters in Astro's 8-char hash (base64url, including `_`). */
const ORIGINAL_HASH_CHARS = /^[\w\-]+$/iv
const ORIGINAL_REFERENCE = /\.([\w\-]{8})\.(jpe?g|png|webp|svg)\b/giv
const PERCENT_ESCAPE = /%([\da-f]{2})/giv
const SCRIPT_ESCAPE = /\\(?:u([\da-f]{4})|x([\da-f]{2}))/giv
const SCRIPT_CODE_POINT_ESCAPE = /\\u\{([\da-f]+)\}/giv
const CSS_HEX_ESCAPE = /\\([\da-f]{1,6})(?:\r\n|[\t\n\f\r ])?/giv
const CHARACTER_ESCAPE = /\\([^\n\r\f])/gv
const REFERENCE_FILE_EXTENSIONS = new Set([
	'.cjs',
	'.css',
	'.htm',
	'.html',
	'.js',
	'.json',
	'.mjs',
	'.svg',
	'.webmanifest',
	'.xml',
])

function referenceKey(file: string): string {
	const { ext, name } = path.parse(file)
	return `${name.slice(-8)}${ext.toLowerCase()}`
}

/** Decode URL and stylesheet/script escapes before recognizing asset names. */
function decodeReferenceText(text: string): string {
	return text
		.replaceAll(SCRIPT_CODE_POINT_ESCAPE, (match: string, hex: string) => {
			const codePoint = Number.parseInt(hex, 16)
			return codePoint <= 0x10_ff_ff ? String.fromCodePoint(codePoint) : match
		})
		.replaceAll(SCRIPT_ESCAPE, (_match: string, unicode: string | undefined, byte: string) =>
			String.fromCodePoint(Number.parseInt(unicode ?? byte, 16)),
		)
		.replaceAll(CSS_HEX_ESCAPE, (match: string, hex: string) => {
			const codePoint = Number.parseInt(hex, 16)
			return codePoint <= 0x10_ff_ff ? String.fromCodePoint(codePoint) : match
		})
		.replaceAll(CHARACTER_ESCAPE, '$1')
		.replaceAll(PERCENT_ESCAPE, (_match: string, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
}

/**
 * Retain originals mentioned anywhere in generated pages and supporting text
 * assets. Matching the hash and extension conservatively avoids resolving base
 * paths, relative links, CDN prefixes, or URLs in arbitrary HTML attributes.
 * Each document is scanned once, independently of the number of originals.
 */
async function findReferencedOriginals(
	directory: URL,
	originals: string[],
	serverDirectory: undefined | URL,
	requireServerOutput: boolean,
): Promise<Set<string>> {
	const remainingKeys = new Set(originals.map((file) => referenceKey(file)))
	const referencedKeys = new Set<string>()
	const scan = (text: string) => {
		for (const match of decodeReferenceText(text).matchAll(ORIGINAL_REFERENCE)) {
			const key = `${match[1]!}.${match[2]!.toLowerCase()}`
			if (remainingKeys.delete(key)) {
				referencedKeys.add(key)
			}
		}
	}

	const entries = await referenceEntries(directory, serverDirectory, requireServerOutput)

	for (const entry of entries) {
		if (remainingKeys.size === 0) {
			break
		}

		const extension = path.extname(entry.name).toLowerCase()
		if (!entry.isFile() || !REFERENCE_FILE_EXTENSIONS.has(extension)) {
			continue
		}

		const text = await readFile(path.join(entry.parentPath, entry.name), 'utf8')
		scan(text)
		if (remainingKeys.size === 0 || !['.htm', '.html', '.svg', '.xml'].includes(extension)) {
			continue
		}

		// Parsing also decodes named and numeric entities in attributes and text,
		// including image URLs in sitemap and feed elements.
		const { document } = parseHTML(text)
		scan(document.querySelector('*')?.textContent ?? '')
		for (const element of document.querySelectorAll('*')) {
			for (const attribute of element.attributes) {
				scan(attribute.value)
			}
		}
	}

	return referencedKeys
}

async function referenceEntries(
	directory: URL,
	serverDirectory: undefined | URL,
	requireServerOutput: boolean,
): Promise<Dirent[]> {
	let entries = await readdir(directory, { recursive: true, withFileTypes: true })
	if (requireServerOutput && serverDirectory === undefined) {
		throw new Error('The server output directory is unavailable.')
	}

	if (
		requireServerOutput &&
		serverDirectory !== undefined &&
		containsDirectory(directory, serverDirectory)
	) {
		const serverStatus = await stat(serverDirectory)
		if (!serverStatus.isDirectory()) {
			throw new Error('The server output path is not a directory.')
		}
	}

	if (serverDirectory !== undefined && !containsDirectory(directory, serverDirectory)) {
		try {
			const serverEntries = await readdir(serverDirectory, { recursive: true, withFileTypes: true })
			// A custom server root can contain the client output. Its recursive
			// listing already covers the client files, so do not scan those twice.
			entries = containsDirectory(serverDirectory, directory)
				? serverEntries
				: [...entries, ...serverEntries]
		} catch (error) {
			if (
				requireServerOutput ||
				!(error instanceof Error) ||
				!('code' in error) ||
				error.code !== 'ENOENT'
			) {
				throw error
			}
		}
	}

	return entries
}

function containsDirectory(parent: URL, child: URL): boolean {
	const relative = path.relative(fileURLToPath(parent), fileURLToPath(child))
	return (
		relative === '' ||
		(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
	)
}

/**
 * Whether `file` has the structural shape of an Astro image-pipeline original.
 *
 * Astro's naming convention for image pipeline output:
 *
 * - Original: `{base}.{HASH8}.{ext}`
 * - Variant: `{base}.{HASH8}_{transform}.{ext}`
 *
 * Identified positionally: the penultimate `.`-separated segment must be
 * exactly 8 chars from `[A-Za-z0-9_-]`. Variants are rejected by length (always
 * longer, due to the `_{transform}` suffix). Underscores can occur in the hash
 * itself as well as in the separator.
 *
 * Shape alone does not mean the file is unused; use `findUnusedOriginals` to
 * select only those originals that have at least one variant sibling.
 */
export function hasOriginalImageShape(file: string): boolean {
	const { ext, name } = path.parse(file)
	const fileFormat = ext.slice(1).toLowerCase()

	if (!(ORIGINAL_IMAGE_FORMATS as readonly string[]).includes(fileFormat)) {
		return false
	}

	const dot = name.lastIndexOf('.')
	if (dot === -1) {
		return false
	}

	const tail = name.slice(dot + 1)
	return tail.length === 8 && ORIGINAL_HASH_CHARS.test(tail)
}

/**
 * From a list of filenames, return those that are unused Astro image originals:
 * files with the original shape `{base}.{HASH8}.{ext}` AND at least one sibling
 * variant of the form `{base}.{HASH8}_{transform}.{anyExt}`.
 *
 * Originals with no variant siblings are retained — they are the only copy.
 */
export function findUnusedOriginals(files: readonly string[]): string[] {
	// Index variant stems once. Scanning every filename for every original
	// makes this build hook quadratic on large image collections.
	const variantStems = new Set<string>()
	for (const file of files) {
		const { name } = path.parse(file)
		const separator = name.lastIndexOf('.') + 9
		if (name[separator] === '_' && name.length > separator + 1) {
			variantStems.add(name.slice(0, separator))
		}
	}

	return files.filter(
		(file) => hasOriginalImageShape(file) && variantStems.has(path.parse(file).name),
	)
}

/**
 * Delete unused original images from the Astro build output directory.
 *
 * Inspired by
 * https://github.com/withastro/astro/issues/4961#issuecomment-2322936873
 */
export async function removeOriginalImages(
	directory: URL,
	astroConfig: AstroConfig,
	logger: AstroIntegrationLogger,
): Promise<void> {
	const astroAssetsDirectory = path.join(fileURLToPath(directory), astroConfig.build.assets)
	let entries: Dirent[]
	try {
		entries = await readdir(astroAssetsDirectory, { withFileTypes: true })
	} catch (error) {
		// Builds without bundled assets do not create this directory.
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return
		}

		throw error
	}

	const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
	const unusedOriginals = findUnusedOriginals(files)
	if (unusedOriginals.length === 0) {
		return
	}

	// Complete every read before deleting anything. If scanning fails, retain
	// the originals because their references could not be checked safely.
	let referencedKeys: Set<string>
	try {
		referencedKeys = await findReferencedOriginals(
			directory,
			unusedOriginals,
			astroConfig.build.server,
			astroConfig.output === 'server',
		)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		logger.error(`Skipping original image cleanup because references could not be read: ${message}`)
		return
	}

	const removableOriginals = unusedOriginals.filter(
		(file) => !referencedKeys.has(referenceKey(file)),
	)

	let removedFilesCount = 0

	for (const file of removableOriginals) {
		try {
			await unlink(path.join(astroAssetsDirectory, file))
			removedFilesCount++
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			logger.error(`Couldn't remove file ${file}: ${message}`)
		}
	}

	if (removableOriginals.length > 0) {
		logger.info(`Removed ${removedFilesCount}/${removableOriginals.length} unused original images.`)
	}
}
