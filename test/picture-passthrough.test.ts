// Scope: media-kit's <Picture> under an image service that sets no output
// format, as Astro's passthrough service does (the Cloudflare adapter's
// `imageService: 'passthrough'`). On a dev server, and on a page rendered on
// demand, an image's address is then the `/_image` endpoint's, with no file
// extension to tell a format from, and each `<source>` used to render
// `type="image/undefined"`: browsers skip a source of a type they don't know,
// so the picture fell back to its `<img>`. A static build is not affected,
// its addresses end in a file name, so this runs a dev server.

import type { CheerioAPI } from 'cheerio'
import { dev } from 'astro'
import { passthroughImageService } from 'astro/config'
import { load } from 'cheerio'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const FIXTURE_ROOT = fileURLToPath(new URL('parity/fixtures/picture-darkmode/', import.meta.url))

const ENDPOINT_SRCSET = /^\/_image\?href=\S+&w=480&h=480 480w, /v

/** Each source's `type` in a set of `<source>` elements, in document order. */
function typesOf($: CheerioAPI, selector: string): Array<string | undefined> {
	return Array.from($(selector), (element) => $(element).attr('type'))
}

describe('Picture source types with a passthrough image service', () => {
	let server: Awaited<ReturnType<typeof dev>>

	async function readHTML(pagePath: string): Promise<CheerioAPI> {
		const response = await fetch(`http://localhost:${String(server.address.port)}${pagePath}`)
		expect(response.status).toBe(200)
		return load(await response.text())
	}

	beforeAll(async () => {
		// Astro leaves its dev server's page handling out when it starts under
		// Vitest, which it tells by this variable.
		vi.stubEnv('VITEST', undefined)
		try {
			server = await dev({
				image: { service: passthroughImageService() },
				logLevel: 'silent',
				root: FIXTURE_ROOT,
			})
		} finally {
			vi.unstubAllEnvs()
		}
	})

	afterAll(async () => {
		await server.stop()
	})

	it('serves the images from an endpoint address without a file extension', async () => {
		const $ = await readHTML('/source-types/')
		expect($('#rules source').attr('srcset')).toMatch(ENDPOINT_SRCSET)
	})

	it('types a source by its image when per-format rules pick the formats', async () => {
		const $ = await readHTML('/source-types/')
		expect(typesOf($, '#rules source')).toEqual(['image/jpeg'])
	})

	it('leaves the type off a source whose format nothing tells', async () => {
		const $ = await readHTML('/source-types/')
		expect($('#remote source').attr('srcset')).toBe('https://example.com/photo')
		expect(typesOf($, '#remote source')).toEqual([undefined])
	})

	it('types the light, dark and dark fallback sources of a media query picture', async () => {
		const $ = await readHTML('/media-fallback/')
		expect(typesOf($, '#empty source')).toEqual(['image/png'])
		expect(typesOf($, '#preferred source')).toEqual(['image/png', 'image/png', 'image/jpeg'])
		expect(typesOf($, '#background source')).toEqual([
			'image/svg+xml',
			'image/svg+xml',
			'image/svg+xml',
		])
	})

	it('types the sources of both pictures of a selector pair', async () => {
		const $ = await readHTML('/selector-with-dark/')
		expect(typesOf($, 'picture.amk-dark source')).toEqual(['image/png'])
		expect(typesOf($, 'picture.amk-light source')).toEqual(['image/jpeg'])
	})
})
