import type { ImageMetadata } from 'astro'
import { exiftool } from 'exiftool-vendored'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { toCaptionProps } from '../src/components/caption-props-map'

describe('toCaptionProps', () => {
	let root: string
	let tagged: ImageMetadata
	let untagged: ImageMetadata

	beforeAll(async () => {
		// Inside the cwd because the XMP lookup resolves paths against it
		const cacheDirectory = path.join(process.cwd(), 'node_modules', '.cache')
		await mkdir(cacheDirectory, { recursive: true })
		root = await mkdtemp(path.join(cacheDirectory, 'astro-media-kit-caption-'))

		const xmp = [
			'<x:xmpmeta xmlns:x="adobe:ns:meta/">',
			'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
			'<rdf:Description rdf:about=""',
			' xmlns:dc="http://purl.org/dc/elements/1.1/"',
			' xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"',
			' xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
			' photoshop:Credit="Tagged Agency" xmp:Label="photo">',
			'<dc:creator><rdf:Seq><rdf:li>Tagged Creator</rdf:li></rdf:Seq></dc:creator>',
			'</rdf:Description>',
			'</rdf:RDF>',
			'</x:xmpmeta>',
		].join('')

		const blank = sharp({
			create: { background: { r: 0, g: 0, b: 0 }, channels: 3, height: 8, width: 8 },
		})
		const taggedPath = path.join(root, 'tagged.jpg')
		await blank.clone().withXmp(xmp).jpeg().toFile(taggedPath)
		const untaggedPath = path.join(root, 'untagged.jpg')
		await blank.clone().jpeg().toFile(untaggedPath)

		tagged = { format: 'jpg', height: 8, src: taggedPath, width: 8 }
		untagged = { format: 'jpg', height: 8, src: untaggedPath, width: 8 }
	})

	afterAll(async () => {
		await exiftool.end()
		await rm(root, { force: true, recursive: true })
	})

	it('hides the credit line and reads no XMP by default', async () => {
		expect(await toCaptionProps({}, { src: tagged, typeFallback: 'image' })).toEqual({
			creator: undefined,
			organization: undefined,
			showCredit: false,
			type: 'image',
		})
	})

	it('fills the credit line from XMP when credit is true', async () => {
		expect(await toCaptionProps({ credit: true }, { src: tagged, typeFallback: 'image' })).toEqual({
			creator: 'Tagged Creator',
			organization: 'Tagged Agency',
			showCredit: true,
			type: 'photo',
		})
	})

	it('prefers explicit props over XMP values', async () => {
		expect(
			await toCaptionProps(
				{ credit: 'Jane Doe', creditMediaType: 'diagram', creditOrganization: 'Acme' },
				{ src: tagged, typeFallback: 'image' },
			),
		).toEqual({ creator: 'Jane Doe', organization: 'Acme', showCredit: true, type: 'diagram' })
	})

	it('keeps XMP values for the props left unset', async () => {
		expect(
			await toCaptionProps({ credit: 'Jane Doe' }, { src: tagged, typeFallback: 'image' }),
		).toEqual({
			creator: 'Jane Doe',
			organization: 'Tagged Agency',
			showCredit: true,
			type: 'photo',
		})
	})

	it('reads the creator from XMP when the other props are explicit', async () => {
		expect(
			await toCaptionProps(
				{ credit: true, creditMediaType: 'diagram', creditOrganization: 'Acme' },
				{ src: tagged, typeFallback: 'image' },
			),
		).toEqual({
			creator: 'Tagged Creator',
			organization: 'Acme',
			showCredit: true,
			type: 'diagram',
		})
	})

	it('prefers the XMP label over creditMediaTypeFallback', async () => {
		expect(
			await toCaptionProps(
				{ credit: true, creditMediaTypeFallback: 'screenshot' },
				{ src: tagged, typeFallback: 'image' },
			),
		).toMatchObject({ type: 'photo' })
	})

	it('uses creditMediaTypeFallback when the image has no XMP label', async () => {
		expect(
			await toCaptionProps(
				{ credit: true, creditMediaTypeFallback: 'screenshot' },
				{ src: untagged, typeFallback: 'image' },
			),
		).toEqual({ creator: undefined, organization: undefined, showCredit: true, type: 'screenshot' })
	})

	it('falls back to the component type without a source', async () => {
		expect(await toCaptionProps({ credit: 'Jane Doe' }, { typeFallback: 'video' })).toEqual({
			creator: 'Jane Doe',
			organization: undefined,
			showCredit: true,
			type: 'video',
		})
	})
})
