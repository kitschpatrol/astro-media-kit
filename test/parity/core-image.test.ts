// Ported from: https://github.com/withastro/astro/blob/astro%406.3.5/packages/astro/test/core-image.test.js
// Upstream Astro pinned: 6.3.5
// Scope: Astro-standard props only. Media-kit extensions (caption/zoom/darkMode/background) are tested in test/*.test.ts.

import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './helpers/build-fixture'

describe('parity: Image / Picture with local images (SSG)', () => {
	let fx: Awaited<ReturnType<typeof buildFixture>>

	beforeAll(async () => {
		fx = await buildFixture('core-image')
	})

	it('Local images - emits a hashed asset URL containing the original filename', async () => {
		// SSG mode pre-builds images to /_astro/<name>.<hash>.<ext>. (Dev/SSR use the
		// /_image endpoint with query params; we test SSG here.)
		const $ = await fx.readHTML('/local-basic/')
		const src = $('#local').attr('src')
		expect(src).toBeDefined()
		expect(src).toMatch(/^\/_astro\//)
		expect(src).toContain('penguin1')
	})

	it('Local images - propagates width and height to the <img>', async () => {
		const $ = await fx.readHTML('/local-basic/')
		const img = $('#local')
		expect(img.attr('width')).toBe('300')
		expect(img.attr('height')).toBe('200')
	})

	it('Local images - propagates alt to the <img>', async () => {
		const $ = await fx.readHTML('/local-basic/')
		expect($('#local').attr('alt')).toBe('a penguin')
	})

	it('Local images - densities produce a pixel-density srcset (URL Nx)', async () => {
		const $ = await fx.readHTML('/local-densities/')
		const srcset = $('#local').attr('srcset')
		expect(srcset).toBeDefined()
		const candidates = srcset!.split(',').map((s) => s.trim())
		expect(candidates.length).toBeGreaterThan(0)
		for (const candidate of candidates) {
			expect(candidate).toMatch(/\s\d+(?:\.\d+)?x$/)
		}
	})

	it('Local images - widths + sizes produce a width-descriptor srcset (URL Nw) and pass sizes through', async () => {
		const $ = await fx.readHTML('/local-widths/')
		const img = $('#local')
		const srcset = img.attr('srcset')
		expect(srcset).toBeDefined()
		const candidates = srcset!.split(',').map((s) => s.trim())
		expect(candidates.length).toBeGreaterThan(0)
		for (const candidate of candidates) {
			expect(candidate).toMatch(/\s\d+w$/)
		}

		expect(img.attr('sizes')).toContain('50vw')
	})

	it('Local images - quality propagates (asset hash differs from default-quality build of the same source)', async () => {
		// SSG bakes quality into the file content, not the URL. Two builds of the
		// same source with different quality must produce different hashed paths.
		const [$basic, $quality] = await Promise.all([
			fx.readHTML('/local-basic/'),
			fx.readHTML('/local-quality/'),
		])
		const basicSrc = $basic('#local').attr('src')!
		const qualitySrc = $quality('#local').attr('src')!
		expect(qualitySrc).toMatch(/^\/_astro\//)
		expect(qualitySrc).toContain('penguin1')
		expect(qualitySrc).not.toBe(basicSrc)
	})

	it('Local images - format propagates (output file uses the requested extension)', async () => {
		const $ = await fx.readHTML('/local-format/')
		const src = $('#local').attr('src')!
		expect(src).toMatch(/^\/_astro\//)
		expect(src).toMatch(/\.avif$/)
	})

	it('Picture - emits <picture> with one <source> per format and an <img> fallback', async () => {
		const $ = await fx.readHTML('/picture-formats/')
		const picture = $('picture')
		expect(picture.length).toBe(1)

		const sources = picture.find('source')
		expect(sources.length).toBe(2)
		expect(sources.eq(0).attr('type')).toBe('image/avif')
		expect(sources.eq(1).attr('type')).toBe('image/webp')

		const img = picture.find('img')
		expect(img.length).toBe(1)
		expect(img.attr('alt')).toBe('a penguin')
		expect(img.attr('width')).toBe('300')
		expect(img.attr('height')).toBe('200')
		// JPEG input falls back to JPEG per DEFAULT_FALLBACK_RULES
		expect(img.attr('src')).toMatch(/\.jpe?g$/)
	})
})
