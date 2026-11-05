/**
 * Synthetic hash fragments from Astro build output — unknown "words".
 * CSpell:disable
 */
import type { AstroConfig, AstroIntegrationLogger } from 'astro'
import * as fileSystem from 'node:fs/promises'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
	findUnusedOriginals,
	hasOriginalImageShape,
	removeOriginalImages,
} from '../src/integration/remove-originals'

vi.mock('node:fs/promises', { spy: true })

describe('hasOriginalImageShape', () => {
	const originals = [
		'tree-31_3959662939_o.DNU0OUL6.jpg',
		'tree-31_3960433676_o.DXRj2UbG.jpg',
		'tree-32_3959664913_o.CE-qICGi.jpg',
		'plexi-box-building-9.e8sCk-Uh.jpg',
		'building-7a3a761f.Cj8_WxVc.png',
		'disruptors-1-e7bd18ac.DC_Jx_ss.png',
		'overview-8debfb8f.H_vWOpLr.png',
	]

	const notOriginals = [
		'tree-31_3960433676_o.DXRj2UbG_1pzWkx.webp',
		'tree-31_3960433676_o.DXRj2UbG_E7yWS.jpg',
		'tree-32_3959664913_o.CE-qICGi_107KdY.jpg',
		'tree-32_3960435040_o.B9379L8L_9Y8O8.jpg',
		'building-7a3a761f.Cj8_WxVc_Fs2U5.webp',
		'disruptors-1-e7bd18ac.DC_Jx_ss_ZH0uzO.webp',
		'overview-8debfb8f.H_vWOpLr_qyrxT.webp',
	]

	it.each(originals)('matches original shape %s', (file) => {
		expect(hasOriginalImageShape(file)).toBe(true)
	})

	it.each(notOriginals)('rejects variant shape %s', (file) => {
		expect(hasOriginalImageShape(file)).toBe(false)
	})

	it('rejects files with unsupported extensions', () => {
		expect(hasOriginalImageShape('photo.DNU0OUL6.gif')).toBe(false)
		expect(hasOriginalImageShape('photo.DNU0OUL6.txt')).toBe(false)
	})

	it('rejects files without a penultimate dot-segment', () => {
		expect(hasOriginalImageShape('DNU0OUL6.jpg')).toBe(false)
	})

	it('rejects penultimate segments of the wrong length', () => {
		expect(hasOriginalImageShape('photo.ABCDEFG.jpg')).toBe(false)
		expect(hasOriginalImageShape('photo.ABCDEFGHI.jpg')).toBe(false)
	})

	it.each(['AB_DEFGH', '_BCDEFGH', 'ABCDEFG_'])(
		'accepts underscores anywhere in the hash %s',
		(hash) => {
			expect(hasOriginalImageShape(`photo.${hash}.jpg`)).toBe(true)
		},
	)

	it('rejects characters outside the base64url alphabet', () => {
		expect(hasOriginalImageShape('photo.AB+DEFGH.jpg')).toBe(false)
	})

	it('accepts uppercase extensions', () => {
		expect(hasOriginalImageShape('tree-31_3959662939_o.DNU0OUL6.JPG')).toBe(true)
	})
})

describe('findUnusedOriginals', () => {
	it('discards originals that have variant siblings and keeps the lone original', () => {
		const files = [
			// Lone original — no variants anywhere, must be kept.
			'plexi-box-building-9.e8sCk-Uh.jpg',

			// Original + its variants.
			'tree-31_3959662939_o.DNU0OUL6.jpg',

			// Original + its variants.
			'tree-31_3960433676_o.DXRj2UbG.jpg',
			'tree-31_3960433676_o.DXRj2UbG_1pzWkx.webp',
			'tree-31_3960433676_o.DXRj2UbG_E7yWS.jpg',
			'tree-31_3960433676_o.DXRj2UbG_Z2eDPqW.webp',
			'tree-31_3960433676_o.DXRj2UbG_ZBY07N.webp',
			'tree-31_3960433676_o.DXRj2UbG_Zmsnap.jpg',
			'tree-31_3960433676_o.DXRj2UbG_Zq4YQB.jpg',

			// Original + its variants.
			'tree-32_3959664913_o.CE-qICGi.jpg',
			'tree-32_3959664913_o.CE-qICGi_107KdY.jpg',
			'tree-32_3959664913_o.CE-qICGi_1KA8AD.webp',
			'tree-32_3959664913_o.CE-qICGi_CGrQ6.jpg',
			'tree-32_3959664913_o.CE-qICGi_cYTIL.jpg',
			'tree-32_3959664913_o.CE-qICGi_naOSH.webp',
			'tree-32_3959664913_o.CE-qICGi_Z2vHdC.webp',

			// Variants only (no .HASH8.jpg original to delete).
			'tree-32_3960435040_o.B9379L8L_9Y8O8.jpg',
			'tree-32_3960435040_o.B9379L8L_UrwbM.webp',
			'tree-32_3960435040_o.B9379L8L_Z2ikGqw.webp',
			'tree-32_3960435040_o.B9379L8L_ZASkxQ.webp',
			'tree-32_3960435040_o.B9379L8L_ZlmHAs.jpg',
			'tree-32_3960435040_o.B9379L8L_ZtKPQb.jpg',
		]

		// Note: DNU0OUL6.jpg is listed without siblings in the input above, so it
		// must be kept. Only DXRj2UbG.jpg and CE-qICGi.jpg have siblings.
		expect(findUnusedOriginals(files).toSorted()).toEqual(
			['tree-31_3960433676_o.DXRj2UbG.jpg', 'tree-32_3959664913_o.CE-qICGi.jpg'].toSorted(),
		)
	})

	it('discards originals with underscores in their hashes only when variants exist', () => {
		const originals = [
			'building-7a3a761f.Cj8_WxVc.png',
			'disruptors-1-e7bd18ac.DC_Jx_ss.png',
			'overview-8debfb8f.H_vWOpLr.png',
		]
		const files = [
			...originals,
			'building-7a3a761f.Cj8_WxVc_Fs2U5.webp',
			'disruptors-1-e7bd18ac.DC_Jx_ss_ZH0uzO.webp',
			'overview-8debfb8f.H_vWOpLr_qyrxT.webp',
			'lone.AB_DEFGH.png',
		]

		expect(findUnusedOriginals(files)).toEqual(originals)
	})

	it('treats variants of different extensions as valid siblings', () => {
		const files = ['photo.ABCDEFGH.jpg', 'photo.ABCDEFGH_x1.webp']
		expect(findUnusedOriginals(files)).toEqual(['photo.ABCDEFGH.jpg'])
	})

	it('does not remove an original for an empty transform suffix', () => {
		expect(findUnusedOriginals(['photo.ABCDEFGH.jpg', 'photo.ABCDEFGH_.webp'])).toEqual([])
	})

	it('matches dotted basenames without confusing underscores in the hash', () => {
		expect(findUnusedOriginals(['my.photo.AB_CDEFG.jpg', 'my.photo.AB_CDEFG_small.webp'])).toEqual([
			'my.photo.AB_CDEFG.jpg',
		])
	})

	it('returns empty when only originals exist', () => {
		const files = ['photo-1.ABCDEFGH.jpg', 'photo-2.IJKLMNOP.webp']
		expect(findUnusedOriginals(files)).toEqual([])
	})

	it('returns empty when only variants exist', () => {
		const files = ['photo.ABCDEFGH_a1.jpg', 'photo.ABCDEFGH_b2.webp']
		expect(findUnusedOriginals(files)).toEqual([])
	})

	it('does not treat differently-hashed files as siblings', () => {
		const files = ['photo.ABCDEFGH.jpg', 'photo.IJKLMNOP_x1.webp']
		expect(findUnusedOriginals(files)).toEqual([])
	})
})

/**
 * A resolved config whose server output sits beside the client output, as
 * Astro's does.
 */
function configFor(root: string): AstroConfig {
	const config = { build: { assets: '_astro', server: pathToFileURL(`${root}/server/`) } }
	return config as AstroConfig
}

describe('removeOriginalImages', () => {
	const logError = vi.fn()
	const logger = { error: logError, info: vi.fn() } as unknown as AstroIntegrationLogger

	it('accepts a build without an assets directory', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'amk-originals-'))
		try {
			await expect(
				removeOriginalImages(pathToFileURL(`${root}/`), configFor(root), logger),
			).resolves.toBeUndefined()
		} finally {
			await rm(root, { force: true, recursive: true })
		}
	})

	it('only considers regular files as originals and variants', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'amk-originals-'))
		const assets = path.join(root, '_astro')
		try {
			await mkdir(assets)
			await writeFile(path.join(assets, 'photo.ABCDEFGH.jpg'), 'original')
			await mkdir(path.join(assets, 'photo.ABCDEFGH_variant.webp'))
			await writeFile(path.join(assets, 'other.ABCDEFGH.jpg'), 'original')
			await writeFile(path.join(assets, 'other.ABCDEFGH_variant.webp'), 'variant')
			await removeOriginalImages(pathToFileURL(`${root}/`), configFor(root), logger)
			const remaining = await readdir(assets)
			expect(remaining.toSorted()).toEqual([
				'other.ABCDEFGH_variant.webp',
				'photo.ABCDEFGH.jpg',
				'photo.ABCDEFGH_variant.webp',
			])
		} finally {
			await rm(root, { force: true, recursive: true })
		}
	})

	it.each([
		['index.html', '<img src="/_astro/my%20photo.ABCDEFGH.jpg">'],
		[
			'nested/index.html',
			'<a href="../_astro/my%20photo.ABCDEFGH.jpg?download#full">Full size</a>',
		],
		['nested/index.html', '<img src="/docs/_astro/my%20photo.ABCDEFGH.jpg">'],
		['index.html', '<img src="https://example.com/docs/_astro/my%20photo.ABCDEFGH.jpg">'],
		['index.html', '<img src="https://cdn.example.com/images/my%20photo.ABCDEFGH.jpg">'],
		['index.html', '<img srcset="/small.webp 300w, /_astro/my%20photo.ABCDEFGH.jpg 1200w">'],
		['index.html', '<div style="background-image: url(/_astro/my%20photo.ABCDEFGH.jpg)"></div>'],
		['index.html', '<img src="/_astro/my%20photo%2E%41BCDEFGH%2Ejpg">'],
		['index.html', '<img src="/_astro/my%20photo&#46;&#65;BCDEFGH&period;jpg">'],
		['assets/theme.css', '.hero{background:url(../_astro/my%20photo.ABCDEFGH.jpg)}'],
		['assets/theme.css', String.raw`.hero{background:url(../_astro/my\ photo\.ABCDEF\47 H.jpg)}`],
		['assets/data.json', String.raw`{"url":"/_astro/my%20photo\u002eABCDEFGH.jpg"}`],
		['assets/loader.js', String.raw`const src = '/_astro/my%20photo.ABCDEFGH\x2ejpg'`],
		['assets/loader.js', String.raw`const src = '/_astro/my%20photo\u{2e}ABCDEFGH.jpg'`],
		[
			'assets/loader.js',
			String.raw`const invalid = '\u{110000}'; const src = '/_astro/my%20photo.ABCDEFGH.jpg'`,
		],
		['assets/drawing.svg', '<svg><image href="/_astro/my%20photo.ABCDEFGH.jpg" /></svg>'],
		['site.webmanifest', '{"icons":[{"src":"/_astro/my%20photo.ABCDEFGH.jpg"}]}'],
		[
			'sitemap.xml',
			'<urlset><url><loc>https://example.com/_astro/my%20photo.ABCDEFGH.jpg</loc></url></urlset>',
		],
		[
			'feed.xml',
			'<rss><channel><image><url>https://example.com/_astro/my%20photo&#46;ABCDEFGH&#46;jpg</url></image></channel></rss>',
		],
		['index.html', '<!-- Unrelated URL: https://example.com/different-name.ABCDEFGH.jpg -->'],
	])('retains originals referenced by %s: %s', async (referenceFile, content) => {
		const root = await mkdtemp(path.join(tmpdir(), 'amk-references-'))
		const assets = path.join(root, '_astro')
		try {
			await mkdir(assets)
			for (const file of [
				'my photo.ABCDEFGH.jpg',
				'my photo.ABCDEFGH_small.webp',
				'other.IJKLMNOP.jpg',
				'other.IJKLMNOP_small.webp',
			]) {
				await writeFile(path.join(assets, file), 'image')
			}

			const pagePath = path.join(root, referenceFile)
			await mkdir(path.dirname(pagePath), { recursive: true })
			await writeFile(pagePath, content)
			await removeOriginalImages(
				pathToFileURL(`${root}/`),
				{ ...configFor(root), base: '/docs', site: 'https://example.com' },
				logger,
			)
			const remaining = await readdir(assets)
			expect(remaining.toSorted()).toEqual([
				'my photo.ABCDEFGH.jpg',
				'my photo.ABCDEFGH_small.webp',
				'other.IJKLMNOP_small.webp',
			])
		} finally {
			await rm(root, { force: true, recursive: true })
		}
	})

	it('retains all originals if a generated reference file cannot be read', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'amk-references-'))
		const assets = path.join(root, '_astro')
		try {
			await mkdir(assets)
			await writeFile(path.join(assets, 'photo.ABCDEFGH.jpg'), 'original')
			await writeFile(path.join(assets, 'photo.ABCDEFGH_variant.webp'), 'variant')
			await writeFile(path.join(root, 'index.html'), '<img src="/_astro/photo.ABCDEFGH.jpg">')
			const read = vi.spyOn(fileSystem, 'readFile').mockRejectedValueOnce(new Error('Read failed'))
			try {
				await removeOriginalImages(pathToFileURL(`${root}/`), configFor(root), logger)
			} finally {
				read.mockRestore()
			}

			const remaining = await readdir(assets)
			expect(remaining.toSorted()).toEqual(['photo.ABCDEFGH.jpg', 'photo.ABCDEFGH_variant.webp'])
			expect(logError).toHaveBeenCalledWith(
				'Skipping original image cleanup because references could not be read: Read failed',
			)
		} finally {
			await rm(root, { force: true, recursive: true })
		}
	})

	it.each(['server', 'client/server'])(
		'scans references in %s output without duplicate reads',
		async (serverPath) => {
			const root = await mkdtemp(path.join(tmpdir(), 'amk-server-references-'))
			const client = path.join(root, 'client')
			const assets = path.join(client, '_astro')
			const server = path.join(root, serverPath)
			try {
				await mkdir(assets, { recursive: true })
				await mkdir(server, { recursive: true })
				for (const file of [
					'photo.ABCDEFGH.jpg',
					'photo.ABCDEFGH_small.webp',
					'other.IJKLMNOP.jpg',
					'other.IJKLMNOP_small.webp',
				]) {
					await writeFile(path.join(assets, file), 'image')
				}

				await writeFile(
					path.join(server, 'entry.mjs'),
					'export const image = "/_astro/photo.ABCDEFGH.jpg"',
				)
				const read = vi.spyOn(fileSystem, 'readFile')
				read.mockClear()
				try {
					await removeOriginalImages(
						pathToFileURL(`${client}/`),
						{
							build: { assets: '_astro', server: pathToFileURL(`${server}/`) },
							output: 'server',
						} as AstroConfig,
						logger,
					)
					expect(read).toHaveBeenCalledTimes(1)
				} finally {
					read.mockRestore()
				}

				const remaining = await readdir(assets)
				expect(remaining.toSorted()).toEqual([
					'other.IJKLMNOP_small.webp',
					'photo.ABCDEFGH.jpg',
					'photo.ABCDEFGH_small.webp',
				])
			} finally {
				await rm(root, { force: true, recursive: true })
			}
		},
	)

	it.each([
		['static', 'server'],
		['server', 'server'],
		['server', 'client/server'],
	] as const)('handles missing %s output at %s conservatively', async (output, serverPath) => {
		const root = await mkdtemp(path.join(tmpdir(), 'amk-missing-server-'))
		const client = path.join(root, 'client')
		const assets = path.join(client, '_astro')
		try {
			await mkdir(assets, { recursive: true })
			await writeFile(path.join(assets, 'photo.ABCDEFGH.jpg'), 'original')
			await writeFile(path.join(assets, 'photo.ABCDEFGH_small.webp'), 'variant')
			await removeOriginalImages(
				pathToFileURL(`${client}/`),
				{
					build: { assets: '_astro', server: pathToFileURL(`${root}/${serverPath}/`) },
					output,
				} as AstroConfig,
				logger,
			)
			const remaining = await readdir(assets)
			expect(remaining.includes('photo.ABCDEFGH.jpg')).toBe(output === 'server')
			expect(remaining).toContain('photo.ABCDEFGH_small.webp')
		} finally {
			await rm(root, { force: true, recursive: true })
		}
	})
})
