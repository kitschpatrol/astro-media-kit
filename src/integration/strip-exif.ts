import type { AstroIntegrationLogger } from 'astro'
import { ExifTool } from 'exiftool-vendored'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Image formats we strip metadata from. */
const METADATA_IMAGE_EXTENSIONS = new Set([
	'.avif',
	'.gif',
	'.heic',
	'.jpeg',
	'.jpg',
	'.png',
	'.tif',
	'.tiff',
	'.webp',
])

/**
 * Strip EXIF/XMP and other metadata from every supported image in the Astro
 * build output directory (including files copied from `public/`). ICC color
 * profiles are kept, so wide-gamut images render as they did.
 *
 * Runs in `astro:build:done`, after all files have been written to disk. Source
 * images under `src/` and `public/` are left untouched on disk — only the
 * copies in the build output are modified.
 */
export async function stripExifFromImages(
	directory: URL,
	logger: AstroIntegrationLogger,
): Promise<void> {
	const root = fileURLToPath(directory)
	const entries = await readdir(root, { recursive: true, withFileTypes: true })

	const targets: string[] = []
	for (const entry of entries) {
		if (!entry.isFile()) {
			continue
		}

		const extension = path.extname(entry.name).toLowerCase()
		if (!METADATA_IMAGE_EXTENSIONS.has(extension)) {
			continue
		}

		targets.push(path.join(entry.parentPath, entry.name))
	}

	if (targets.length === 0) {
		return
	}

	// Own this pool so a completed build does not permanently shut down the
	// shared instance used for image credits or subsequent builds.
	const metadataTool = new ExifTool()
	let strippedCount = 0
	let failedCount = 0

	try {
		// `exiftool.deleteAllTags` leaves a `${file}_original` backup behind, and
		// `-all=` alone deletes the ICC profile, shifting the colors of wide-gamut
		// images. We use `write` directly to copy the profile back from the file
		// itself, as its `retain` option does, and to skip the backup.
		const results = await Promise.allSettled(
			targets.map(async (filePath) =>
				metadataTool.write(
					filePath,
					{},
					{ writeArgs: ['-all=', '-ICC_Profile<ICC_Profile', '-overwrite_original'] },
				),
			),
		)

		for (const [index, result] of results.entries()) {
			if (result.status === 'fulfilled') {
				strippedCount++
			} else {
				failedCount++
				const { reason } = result as { reason: unknown }
				const message = reason instanceof Error ? reason.message : String(reason)
				logger.error(`Couldn't strip EXIF from ${targets[index]}: ${message}`)
			}
		}
	} finally {
		await metadataTool.end()
	}

	if (strippedCount === 0 && failedCount === 0) {
		return
	}

	const suffix = failedCount > 0 ? ` (${failedCount} failed)` : '.'
	logger.info(`Stripped EXIF from ${strippedCount} image${strippedCount === 1 ? '' : 's'}${suffix}`)
}
