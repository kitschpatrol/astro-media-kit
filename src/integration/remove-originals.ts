import type { AstroConfig, AstroIntegrationLogger } from 'astro'
import type { Dirent } from 'node:fs'
import { readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Image formats that may be emitted as originals by Astro's image pipeline. */
const ORIGINAL_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'svg'] as const

/** Valid characters in Astro's 8-char hash (base64url, including `_`). */
const ORIGINAL_HASH_CHARS = /^[\w\-]+$/iv

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

	let removedFilesCount = 0

	for (const file of unusedOriginals) {
		try {
			await unlink(path.join(astroAssetsDirectory, file))
			removedFilesCount++
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			logger.error(`Couldn't remove file ${file}: ${message}`)
		}
	}

	if (unusedOriginals.length > 0) {
		logger.info(`Removed ${removedFilesCount}/${unusedOriginals.length} unused original images.`)
	}
}
