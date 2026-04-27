import type { AstroConfig, AstroIntegrationLogger } from 'astro'
import { readdir, unlink } from 'node:fs/promises'
import path from 'node:path'

/** Image formats that may be emitted as originals by Astro's image pipeline. */
const ORIGINAL_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'svg'] as const

/** Valid characters in Astro's 8-char hash (base64url minus `_`, which is reserved as the variant separator). */
const ORIGINAL_HASH_CHARS = /^[a-z0-9-]+$/i

/**
 * Whether `file` has the structural shape of an Astro image-pipeline original.
 *
 * Astro's naming convention for image pipeline output:
 *   - Original: `{base}.{HASH8}.{ext}`
 *   - Variant:  `{base}.{HASH8}_{transform}.{ext}`
 *
 * Identified positionally: the penultimate `.`-separated segment must be
 * exactly 8 chars from `[A-Za-z0-9-]`. Variants are rejected by length (always
 * longer, due to the `_{transform}` suffix) and by charset (the `_` separator).
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
	if (tail.length !== 8) {
		return false
	}

	if (!ORIGINAL_HASH_CHARS.test(tail)) {
		return false
	}

	return true
}

/**
 * From a list of filenames, return those that are unused Astro image originals:
 * files with the original shape `{base}.{HASH8}.{ext}` AND at least one sibling
 * variant of the form `{base}.{HASH8}_{transform}.{anyExt}`.
 *
 * Originals with no variant siblings are retained — they are the only copy.
 */
export function findUnusedOriginals(files: readonly string[]): string[] {
	const result: string[] = []
	for (const file of files) {
		if (!hasOriginalImageShape(file)) {
			continue
		}

		// `path.parse(file).name` is `{base}.{HASH8}`; a variant sibling's name
		// starts with that plus `_`.
		const variantPrefix = `${path.parse(file).name}_`
		const hasVariant = files.some(
			(other) => other !== file && path.parse(other).name.startsWith(variantPrefix),
		)
		if (hasVariant) {
			result.push(file)
		}
	}

	return result
}

/**
 * Delete unused original images from the Astro build output directory.
 *
 * Inspired by https://github.com/withastro/astro/issues/4961#issuecomment-2322936873
 */
export async function removeOriginalImages(
	directory: URL,
	astroConfig: AstroConfig,
	logger: AstroIntegrationLogger,
): Promise<void> {
	const astroAssetsDirectory = path.join(directory.pathname, astroConfig.build.assets)
	const files = await readdir(astroAssetsDirectory)
	const unusedOriginals = findUnusedOriginals(files)

	let removedFilesCount = 0

	for (const file of unusedOriginals) {
		logger.info(`Removing ${file}`)

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
