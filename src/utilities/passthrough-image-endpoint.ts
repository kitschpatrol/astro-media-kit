/* eslint-disable ts/naming-convention */

import type { APIContext } from 'astro'
import fs from 'node:fs/promises'
import path from 'node:path'

const FS_PATH_PREFIX_REGEX = /^\/@fs\//

/**
 * Don't process images at all, which keeps things snappy. Set conditionally on
 * whether it's a dev build or not in astro.config.ts
 */
export async function GET({ request }: APIContext): Promise<Response> {
	const url = new URL(request.url)
	const href = url.searchParams.get('href')
	if (!href) {
		return new Response('Missing href parameter', { status: 400 })
	}

	const imagePath =
		'./' + path.relative(path.resolve('.'), href.replace(FS_PATH_PREFIX_REGEX, '/')).split('?')[0]

	// Check if the image exists
	try {
		await fs.access(imagePath)
	} catch {
		return new Response('Image not found', { status: 404 })
	}

	// Read the image file
	const imageBuffer = await fs.readFile(imagePath)
	const extension = path.extname(imagePath).slice(1) // Get the file extension

	// Determine the content type based on the file extension
	const contentType =
		{
			avif: 'image/avif',
			gif: 'image/gif',
			jpeg: 'image/jpeg',
			jpg: 'image/jpeg',
			png: 'image/png',
			svg: 'image/svg+xml',
			webp: 'image/webp',
		}[extension] ?? 'application/octet-stream'

	return new Response(imageBuffer, {
		headers: {
			'Cache-Control': 'public, max-age=31536000, immutable',
			'Content-Type': contentType,
		},
		status: 200,
	})
}
