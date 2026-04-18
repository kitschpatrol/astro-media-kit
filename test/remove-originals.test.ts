/**
 * Synthetic hash fragments from Astro build output — unknown "words".
 * cSpell:disable
 */
import { describe, expect, it } from 'vitest'
import { findUnusedOriginals, hasOriginalImageShape } from '../src/integration/remove-originals'

describe('hasOriginalImageShape', () => {
	const originals = [
		'tree-31_3959662939_o.DNU0OUL6.jpg',
		'tree-31_3960433676_o.DXRj2UbG.jpg',
		'tree-32_3959664913_o.CE-qICGi.jpg',
		'plexi-box-building-9.e8sCk-Uh.jpg',
	]

	const notOriginals = [
		'tree-31_3960433676_o.DXRj2UbG_1pzWkx.webp',
		'tree-31_3960433676_o.DXRj2UbG_E7yWS.jpg',
		'tree-32_3959664913_o.CE-qICGi_107KdY.jpg',
		'tree-32_3960435040_o.B9379L8L_9Y8O8.jpg',
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

	it('rejects penultimate segments containing an underscore', () => {
		expect(hasOriginalImageShape('photo.AB_DEFGH.jpg')).toBe(false)
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

	it('treats variants of different extensions as valid siblings', () => {
		const files = ['photo.ABCDEFGH.jpg', 'photo.ABCDEFGH_x1.webp']
		expect(findUnusedOriginals(files)).toEqual(['photo.ABCDEFGH.jpg'])
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
