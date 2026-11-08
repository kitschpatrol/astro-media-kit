/* eslint-disable ts/naming-convention */

import type { AstroIntegrationLogger } from 'astro'
import { ExifTool } from 'exiftool-vendored'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stripExifFromImages } from '../src/integration/strip-exif.ts'

const noop = (): undefined => undefined

const silentLogger = {
	debug: noop,
	error: noop,
	info: noop,
	warn: noop,
} as unknown as AstroIntegrationLogger

describe('stripExifFromImages', () => {
	let root: string
	let jpegPath: string
	let wideGamutPath: string
	let nestedPngPath: string
	let textPath: string
	const metadataTool = new ExifTool()
	const textContents = 'hello\n'

	beforeAll(async () => {
		root = await mkdtemp(path.join(tmpdir(), 'astro-media-kit-strip-exif-'))

		jpegPath = path.join(root, 'photo.jpg')
		await sharp({
			create: { background: { r: 0, g: 0, b: 0 }, channels: 3, height: 8, width: 8 },
		})
			.withExif({ IFD0: { Copyright: 'Test', ImageDescription: 'Should be stripped' } })
			.jpeg()
			.toFile(jpegPath)

		wideGamutPath = path.join(root, 'wide-gamut.jpg')
		await sharp({
			create: { background: { r: 255, g: 0, b: 0 }, channels: 3, height: 8, width: 8 },
		})
			.withExif({ IFD0: { Copyright: 'Wide gamut' } })
			.withIccProfile('p3')
			.jpeg()
			.toFile(wideGamutPath)

		const nested = path.join(root, 'nested')
		await mkdir(nested)
		nestedPngPath = path.join(nested, 'photo.png')
		await sharp({
			create: { background: { r: 0, g: 0, b: 0 }, channels: 3, height: 8, width: 8 },
		})
			.withExif({ IFD0: { Copyright: 'Nested' } })
			.png()
			.toFile(nestedPngPath)

		textPath = path.join(root, 'notes.txt')
		await writeFile(textPath, textContents)

		await stripExifFromImages(pathToFileURL(`${root}/`), silentLogger)
	}, 30_000)

	afterAll(async () => {
		await metadataTool.end()
		await rm(root, { force: true, recursive: true })
	})

	it('strips descriptive EXIF from a top-level JPEG', async () => {
		const tags = await metadataTool.read(jpegPath)
		expect(tags.Copyright).toBeUndefined()
		expect(tags.ImageDescription).toBeUndefined()
	})

	it('keeps the ICC color profile while stripping the other metadata', async () => {
		const { icc } = await sharp(wideGamutPath).metadata()
		const tags = await metadataTool.read(wideGamutPath)
		expect(tags.Copyright).toBeUndefined()
		expect(icc).toBeDefined()
	})

	it.each([2, 3, 4, 5, 6, 7, 8])(
		'keeps orientation %s while removing descriptive metadata',
		async (orientation) => {
			const file = path.join(root, `orientation-${orientation}.jpg`)
			await sharp({
				create: { background: { r: 255, g: 0, b: 0 }, channels: 3, height: 40, width: 80 },
			})
				.withMetadata({ orientation })
				.withExifMerge({ IFD0: { Copyright: 'Remove this credit' } })
				.jpeg()
				.toFile(file)
			const before = await sharp(file).metadata()
			await stripExifFromImages(pathToFileURL(`${root}/`), silentLogger)
			const after = await sharp(file).metadata()
			expect(after.orientation).toBe(orientation)
			expect(after.width).toBe(before.width)
			expect(after.height).toBe(before.height)
			expect(after.autoOrient).toEqual(before.autoOrient)
			const tags = await metadataTool.read(file)
			expect(tags.Copyright).toBeUndefined()
		},
	)

	it('recurses into subdirectories and strips EXIF from a nested PNG', async () => {
		const tags = await metadataTool.read(nestedPngPath)
		expect(tags.Copyright).toBeUndefined()
	})

	it('does not leave _original backup files behind', async () => {
		const entries = await readdir(root, { recursive: true })
		const backups = entries.filter((entry) => entry.endsWith('_original'))
		expect(backups).toEqual([])
	})

	it('can strip metadata again in the same process', async () => {
		const repeatedPath = path.join(root, 'repeated.jpg')
		await sharp({
			create: { background: { r: 0, g: 0, b: 0 }, channels: 3, height: 8, width: 8 },
		})
			.withExif({ IFD0: { Copyright: 'Second build' } })
			.jpeg()
			.toFile(repeatedPath)
		await stripExifFromImages(pathToFileURL(`${root}/`), silentLogger)
		const tags = await metadataTool.read(repeatedPath)
		expect(tags.Copyright).toBeUndefined()
	})

	it('leaves non-image files untouched', async () => {
		expect(await readFile(textPath, 'utf8')).toBe(textContents)
	})
})
