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
		expect(src).toMatch(/^\/_astro\//v)
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
			expect(candidate).toMatch(/\s\d+(?:\.\d+)?x$/v)
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
			expect(candidate).toMatch(/\s\d+w$/v)
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
		expect(qualitySrc).toMatch(/^\/_astro\//v)
		expect(qualitySrc).toContain('penguin1')
		expect(qualitySrc).not.toBe(basicSrc)
	})

	it('Local images - format propagates (output file uses the requested extension)', async () => {
		const $ = await fx.readHTML('/local-format/')
		const src = $('#local').attr('src')!
		expect(src).toMatch(/^\/_astro\//v)
		expect(src).toMatch(/\.avif$/v)
	})

	it('Local images - inferSize is a no-op for ESM-imported sources (Astro deletes the flag, never re-probes the file)', async () => {
		// Two pages render the same penguin1.jpg with width=300 / height=200 — one
		// with `inferSize` set, one without. Astro's getImage() unconditionally
		// strips inferSize before hashing, and only probes the size for remote
		// (http/https) sources. Local ImageMetadata always carries width/height,
		// so the asset URL and emitted img attributes must match byte-for-byte.
		const [$basic, $infer] = await Promise.all([
			fx.readHTML('/local-basic/'),
			fx.readHTML('/local-infer-size/'),
		])
		const basicImg = $basic('#local')
		const inferImg = $infer('#local')
		expect(inferImg.attr('src')).toBe(basicImg.attr('src'))
		expect(inferImg.attr('width')).toBe(basicImg.attr('width'))
		expect(inferImg.attr('height')).toBe(basicImg.attr('height'))
		expect(inferImg.attr('srcset')).toBe(basicImg.attr('srcset'))
	})

	it('Picture - emits <picture> with one <source> per format and an <img> fallback', async () => {
		// The fixture page also renders an astro:assets <Picture id="astro"> for
		// the diff layer; scope to the media-kit <picture id="local"> here.
		const $ = await fx.readHTML('/picture-formats/')
		const picture = $('picture#local')
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
		expect(img.attr('src')).toMatch(/\.jpe?g$/v)
	})

	it('Picture - per-input formats rules: SVG source with formats={{ svg: ["svg"] }} stays vector', async () => {
		// The map form of `formats` lets a caller (or wrapper component) opt out of
		// SVG rasterization without restating the default rule for every other input.
		const $ = await fx.readHTML('/picture-formats-rules-svg/')
		const picture = $('picture')
		expect(picture.length).toBe(1)

		const sources = picture.find('source')
		expect(sources.length).toBe(1)
		expect(sources.eq(0).attr('type')).toBe('image/svg+xml')

		const img = picture.find('img')
		expect(img.length).toBe(1)
		// SVG input + svg fallback per DEFAULT_FALLBACK_RULES — no raster conversion.
		expect(img.attr('src')).toMatch(/\.svg$/v)
	})

	it('Picture - per-input formats rules: JPG source with formats={{ jpg: ["avif","webp"] }} picks the per-input rule', async () => {
		// Verifies the map form looks up by the source's input format
		// (`isESMImportedImage(src).format === "jpg"`) and uses the matching rule
		// rather than the default ['webp'].
		const $ = await fx.readHTML('/picture-formats-rules-jpg/')
		const picture = $('picture')
		expect(picture.length).toBe(1)

		const sources = picture.find('source')
		expect(sources.length).toBe(2)
		expect(sources.eq(0).attr('type')).toBe('image/avif')
		expect(sources.eq(1).attr('type')).toBe('image/webp')

		const img = picture.find('img')
		expect(img.length).toBe(1)
		expect(img.attr('src')).toMatch(/\.jpe?g$/v)
	})
})
