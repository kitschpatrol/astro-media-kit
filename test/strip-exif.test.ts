/* eslint-disable ts/naming-convention */

import type { AstroIntegrationLogger } from 'astro'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stripExifFromImages } from '../src/integration/strip-exif.ts'

const noop = (): undefined => undefined

// eslint-disable-next-line ts/no-unsafe-type-assertion
const silentLogger = {
	debug: noop,
	error: noop,
	info: noop,
	warn: noop,
} as unknown as AstroIntegrationLogger

describe('stripExifFromImages', () => {
	let root: string
	let jpegPath: string
	let nestedPngPath: string
	let textPath: string
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
		await rm(root, { force: true, recursive: true })
	})

	it('strips EXIF from a top-level JPEG', async () => {
		const { exif } = await sharp(jpegPath).metadata()
		expect(exif).toBeUndefined()
	})

	it('recurses into subdirectories and strips EXIF from a nested PNG', async () => {
		const { exif } = await sharp(nestedPngPath).metadata()
		expect(exif).toBeUndefined()
	})

	it('does not leave _original backup files behind', async () => {
		const entries = await readdir(root, { recursive: true })
		const backups = entries.filter((entry) => entry.endsWith('_original'))
		expect(backups).toEqual([])
	})

	it('leaves non-image files untouched', async () => {
		expect(await readFile(textPath, 'utf8')).toBe(textContents)
	})
})
