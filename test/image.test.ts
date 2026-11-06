import type { ImageMetadata } from 'astro'
import { exiftool } from 'exiftool-vendored'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
	getCreditFromXmpTags,
	isDarkLightImageMetadata,
	isImageMetadataObject,
	isImageUrlSource,
	isRemoteImageSource,
	resolveImageSource,
	unwrapImageMetadata,
} from '../src/components/utils/image'

const valid: ImageMetadata = { format: 'png', height: 100, src: '/image.png', width: 200 }

/**
 * An imported image as Astro serves it: `src` is a getter that records a raw
 * reference, which keeps the original file in the build output.
 */
function trackedAsset(): { asset: ImageMetadata; reads: () => number } {
	let reads = 0
	const asset: ImageMetadata = { format: 'png', height: 100, src: '', width: 200 }
	Object.defineProperty(asset, 'src', {
		enumerable: true,
		get() {
			reads++
			return '/image.png'
		},
	})
	return { asset, reads: () => reads }
}

describe('isImageMetadataObject', () => {
	it('accepts valid ImageMetadata objects', () => {
		expect(isImageMetadataObject(valid)).toBe(true)
		expect(isImageMetadataObject({ src: '/test.jpg' })).toBe(true)
	})

	it('accepts SVG components, which carry the metadata as their own properties', () => {
		// eslint-disable-next-line ts/no-empty-function -- simulates Astro's SVG component
		const svgComponent = Object.assign(() => {}, valid)
		expect(isImageMetadataObject(svgComponent)).toBe(true)
		const unwrapped = unwrapImageMetadata(svgComponent)
		expect(typeof unwrapped).toBe('object')
		expect(unwrapped).toEqual(valid)
	})

	it('rejects non-objects', () => {
		/* eslint-disable unicorn/no-null */
		for (const input of [null, undefined, 'string', 42, true]) {
			expect(isImageMetadataObject(input)).toBe(false)
		}
		/* eslint-enable unicorn/no-null */
	})

	it('rejects objects without valid src', () => {
		expect(isImageMetadataObject({ format: 'png', height: 100, width: 200 })).toBe(false)
		expect(isImageMetadataObject({ src: 42 })).toBe(false)
		expect(() =>
			unwrapImageMetadata({ format: 'png', height: 100, width: 200 } as ImageMetadata),
		).toThrow('must carry a string `src`')
	})

	it('leaves a tracked src getter unread', () => {
		const { asset, reads } = trackedAsset()
		expect(isImageMetadataObject(asset)).toBe(true)
		expect(unwrapImageMetadata(asset)).toBe(asset)
		expect(reads()).toBe(0)
	})
})

describe('isImageUrlSource', () => {
	it('delegates remote and public URLs to Astro', () => {
		expect(isImageUrlSource('https://example.com/photo.jpg')).toBe(true)
		expect(isImageUrlSource('/images/photo.jpg')).toBe(true)
	})

	it('retains metadata and relative paths', () => {
		expect(isImageUrlSource(valid)).toBe(false)
		expect(isImageUrlSource('../assets/photo.jpg')).toBe(false)
		expect(isImageUrlSource('photo.jpg')).toBe(false)
	})
})

describe('isRemoteImageSource', () => {
	it('accepts http and https URL strings', () => {
		expect(isRemoteImageSource('https://example.com/image.jpg')).toBe(true)
		expect(isRemoteImageSource('https://example.com/image.jpg')).toBe(true)
	})

	it('rejects absolute and relative file paths', () => {
		expect(isRemoteImageSource('/absolute/path/image.jpg')).toBe(false)
		expect(isRemoteImageSource('./relative/image.jpg')).toBe(false)
		expect(isRemoteImageSource('../parent/image.jpg')).toBe(false)
	})

	it('rejects protocol-relative URLs', () => {
		expect(isRemoteImageSource('//example.com/image.jpg')).toBe(false)
	})

	it('rejects non-string inputs', () => {
		/* eslint-disable unicorn/no-null */
		for (const input of [null, undefined, 42, true, {}, { src: 'https://x.com/y' }]) {
			expect(isRemoteImageSource(input)).toBe(false)
		}
		/* eslint-enable unicorn/no-null */
	})
})

describe('resolveImageSource', () => {
	it('returns the light metadata alone', () => {
		expect(resolveImageSource(valid)).toBe(valid)
	})

	it('pairs a dark variant that matches the light source', () => {
		const dark = { ...valid, src: '/dark.png' }
		expect(resolveImageSource(valid, dark)).toEqual({ dark, light: valid })
	})

	it('rejects a dark variant with another format or size', () => {
		expect(() => resolveImageSource(valid, { ...valid, format: 'jpg' })).toThrow('same format')
		expect(() => resolveImageSource(valid, { ...valid, width: 1 })).toThrow('same dimensions')
	})
})

describe('isDarkLightImageMetadata', () => {
	it('accepts valid dark/light pairs', () => {
		expect(isDarkLightImageMetadata({ dark: valid, light: valid })).toBe(true)
	})

	it('rejects missing or invalid members', () => {
		/* eslint-disable unicorn/no-null */
		expect(isDarkLightImageMetadata({ light: valid })).toBe(false)
		expect(isDarkLightImageMetadata({ dark: valid })).toBe(false)
		expect(isDarkLightImageMetadata(null)).toBe(false)
		expect(isDarkLightImageMetadata(undefined)).toBe(false)
		expect(isDarkLightImageMetadata({ dark: 'not-metadata', light: valid })).toBe(false)
		expect(isDarkLightImageMetadata({ dark: valid, light: 42 })).toBe(false)
		/* eslint-enable unicorn/no-null */
	})
})

describe('getCreditFromXmpTags', () => {
	let root: string
	let taggedPath: string
	let untaggedPath: string

	beforeAll(async () => {
		// Inside the cwd because getCreditFromXmpTags resolves paths against it
		const cacheDirectory = path.join(process.cwd(), 'node_modules', '.cache')
		await mkdir(cacheDirectory, { recursive: true })
		root = await mkdtemp(path.join(cacheDirectory, 'astro-media-kit-xmp-'))

		const xmp = [
			'<x:xmpmeta xmlns:x="adobe:ns:meta/">',
			'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
			'<rdf:Description rdf:about=""',
			' xmlns:dc="http://purl.org/dc/elements/1.1/"',
			' xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"',
			' xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
			' photoshop:Credit="Zoë Agency" xmp:Label="Archive">',
			'<dc:creator><rdf:Seq><rdf:li>Zoë Doe</rdf:li><rdf:li>Second Author</rdf:li></rdf:Seq></dc:creator>',
			'</rdf:Description>',
			'</rdf:RDF>',
			'</x:xmpmeta>',
		].join('')

		const blank = sharp({
			create: { background: { r: 0, g: 0, b: 0 }, channels: 3, height: 8, width: 8 },
		})
		taggedPath = path.join(root, 'tagged.jpg')
		await blank.clone().withXmp(xmp).jpeg().toFile(taggedPath)
		untaggedPath = path.join(root, 'untagged.jpg')
		await blank.clone().jpeg().toFile(untaggedPath)
	})

	afterAll(async () => {
		await exiftool.end()
		await rm(root, { force: true, recursive: true })
	})

	it('reads the first creator, credit, and label from XMP', async () => {
		expect(await getCreditFromXmpTags(taggedPath)).toEqual({
			creator: 'Zoë Doe',
			credit: 'Zoë Agency',
			label: 'Archive',
		})
	})

	it('returns undefined fields for an image without XMP', async () => {
		expect(await getCreditFromXmpTags(untaggedPath)).toEqual({
			creator: undefined,
			credit: undefined,
			label: undefined,
		})
	})

	it('reads the imported file whose path Astro keeps on the metadata', async () => {
		const asset: ImageMetadata & { fsPath: string } = {
			format: 'jpg',
			fsPath: taggedPath,
			height: 8,
			src: '/_astro/tagged.hash.jpg',
			width: 8,
		}
		expect(await getCreditFromXmpTags(asset)).toEqual({
			creator: 'Zoë Doe',
			credit: 'Zoë Agency',
			label: 'Archive',
		})
	})

	it('warns once and returns undefined fields for a missing file', async () => {
		const warn = vi.spyOn(console, 'warn').mockReturnValue(undefined)
		try {
			const missing = path.join(root, 'missing.jpg')
			const empty = { creator: undefined, credit: undefined, label: undefined }
			expect(await getCreditFromXmpTags(missing)).toEqual(empty)
			expect(await getCreditFromXmpTags(missing)).toEqual(empty)
			expect(warn).toHaveBeenCalledOnce()
			expect(warn.mock.calls[0]?.[0]).toContain(missing.replaceAll(path.sep, '/'))
		} finally {
			warn.mockRestore()
		}
	})
})
