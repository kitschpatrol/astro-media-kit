// Direct-diff parity layer: renders our <Image> / <Picture> alongside
// Astro's built-in `astro:assets` <Image> / <Picture> with identical props
// in the same fixture page, then asserts the emitted markup matches modulo
// the documented allowlist (`amk` class, `data-image-component` marker).
//
// Sibling file `core-image.test.ts` holds the ported-assertion layer —
// invariants Astro's own tests assert against `<Image>` / `<Picture>`. Both
// layers share the same fixture build via the cache in
// `helpers/build-fixture.ts`, so this adds no extra build cost.

import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './helpers/build-fixture'
import { compareImg, comparePicture } from './helpers/compare-img'

describe('parity diff: media-kit vs astro:assets output (SSG)', () => {
	let fx: Awaited<ReturnType<typeof buildFixture>>

	beforeAll(async () => {
		fx = await buildFixture('core-image')
	})

	it('local-basic: <img> matches astro:assets output', async () => {
		const $ = await fx.readHTML('/local-basic/')
		compareImg($, '#local', '#astro')
	})

	it('local-densities: <img> with `densities` matches astro:assets output', async () => {
		const $ = await fx.readHTML('/local-densities/')
		compareImg($, '#local', '#astro')
	})

	it('local-format: forced output format matches astro:assets', async () => {
		const $ = await fx.readHTML('/local-format/')
		compareImg($, '#local', '#astro')
	})

	it('local-infer-size: `inferSize` no-op on ESM source matches astro:assets', async () => {
		const $ = await fx.readHTML('/local-infer-size/')
		compareImg($, '#local', '#astro')
	})

	it('local-quality: `quality` propagation matches astro:assets', async () => {
		const $ = await fx.readHTML('/local-quality/')
		compareImg($, '#local', '#astro')
	})

	it('local-widths: `widths` + `sizes` matches astro:assets', async () => {
		const $ = await fx.readHTML('/local-widths/')
		compareImg($, '#local', '#astro')
	})

	it('picture-formats: <picture>/<source>/<img> matches astro:assets output', async () => {
		const $ = await fx.readHTML('/picture-formats/')
		comparePicture($, 'picture#local', 'picture#astro')
	})

	it.each(['dimensions', 'promise', 'style', 'style-object', 'public', 'remote', 'priority'])(
		"Image preserves Astro's %s props",
		async (name) => {
			const $ = await fx.readHTML('/superset-props/')
			compareImg($, `#image-${name}`, `#astro-image-${name}`)
		},
	)

	it.each(['dimensions', 'promise', 'style', 'style-object', 'public', 'remote', 'priority'])(
		"Picture preserves Astro's %s props",
		async (name) => {
			const $ = await fx.readHTML('/superset-props/')
			comparePicture($, `#picture-${name}`, `#astro-picture-${name}`)
		},
	)

	it('keeps Astro background transforms and caller styles alongside the CSS background extension', async () => {
		const $ = await fx.readHTML('/superset-props/')
		for (const name of ['image', 'picture']) {
			const selector = name === 'image' ? '#image-background' : '#picture-background img'
			const astroSelector =
				name === 'image' ? '#astro-image-background' : '#astro-picture-background img'
			expect($(selector).attr('src')).toBe($(astroSelector).attr('src'))
			expect($(selector).attr('style')).toContain('border-radius:12px')
			expect($(selector).attr('style')).toContain('background-color:#fff')
		}
	})
})
