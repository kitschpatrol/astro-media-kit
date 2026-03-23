/* eslint-disable ts/require-await */

import type { ImageMetadata } from 'astro'

/**
 * TODO mocked since this was patched into Astro...
 */
export async function emitImageMetadata(
	id: string | undefined,
): Promise<ImageMetadata | undefined> {
	console.warn(`Mocking metadata for ${id}`)
	if (id === 'something') {
		return {
			format: 'avif',
			height: 42,
			src: 'bla',
			width: 42,
		}
	}
	return undefined
}
