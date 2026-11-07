/* eslint-disable ts/naming-convention */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import nodePath from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { transformAstroSource } from '../src/integration/auto-import.ts'
import { needsBackgroundDarkVariant } from '../src/utilities/dark-variant.ts'

const TLDRAW_EXTENSION_REGEX = /\.tldr(?:\?|$)/v

// Default config: Image and Picture both auto-import 'src'
const defaultConfig = {
	Image: 'src',
	Picture: 'src',
}

// Config with .tldr dark mode transform on Picture
const tldrawDarkTransform = (path: string) =>
	TLDRAW_EXTENSION_REGEX.test(path)
		? `${path}${path.includes('?') ? '&' : '?'}dark=true&tldr`
		: undefined

const configWithTldrawDark = {
	Image: 'src',
	Picture: ['src', { from: 'src', to: 'srcDark', transform: tldrawDarkTransform }],
}

describe('transformAstroSource', () => {
	it('preserves public image URLs for Astro rather than importing them as modules', () => {
		const source = `---
---
<Image src="/images/photo.jpg" alt="Photo" width="300" height="200" />`
		expect(transformAstroSource(source, defaultConfig)).toBeUndefined()
	})

	it('leaves values an entry declines as they are', () => {
		const config = {
			ZoomLink: [
				{
					from: 'src',
					shouldImport: (path: string) => !path.endsWith('.mp4'),
					to: 'src',
				},
			],
		}
		const source = `---
---
<ZoomLink src="../assets/a.jpg">a</ZoomLink>
<ZoomLink src="/media/clip.mp4">b</ZoomLink>`
		const result = transformAstroSource(source, config)
		expect(result).toContain('import __ami_0 from "../assets/a.jpg"')
		expect(result).toContain('<ZoomLink src={__ami_0}>')
		expect(result).toContain('<ZoomLink src="/media/clip.mp4">')
		expect(result).not.toContain('clip.mp4"\n')
	})

	it('injects import and rewrites src for Image', () => {
		const source = `---
import { Image } from 'astro-media-kit'
---
<Image src="../assets/test.jpeg" alt="Blep" />
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toContain('import __ami_0 from "../assets/test.jpeg"')
		expect(result).toContain('src={__ami_0}')
		expect(result).not.toContain('src="../assets/test.jpeg"')
	})

	it('injects import and rewrites src for Picture', () => {
		const source = `---
---
<Picture src="../assets/photo.png" alt="Photo" />
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toContain('import __ami_0 from "../assets/photo.png"')
		expect(result).toContain('src={__ami_0}')
	})

	it('handles srcDark attribute', () => {
		const source = `---
---
<Picture src="../assets/light.png" srcDark="../assets/dark.png" alt="Theme" />
`
		// Config that auto-imports both src and srcDark
		const config = {
			Picture: [
				{ from: 'src', to: 'src' },
				{ from: 'srcDark', to: 'srcDark' },
			],
		}
		const result = transformAstroSource(source, config)
		expect(result).toContain('import __ami_0 from "../assets/light.png"')
		expect(result).toContain('import __ami_1 from "../assets/dark.png"')
		expect(result).toContain('src={__ami_0}')
		expect(result).toContain('srcDark={__ami_1}')
	})

	it('imports secondary props when the first prop is already an expression', () => {
		const expression = '{light}'
		const source = `---
const light = importedImage
---
<Picture src=${expression} srcDark="../assets/dark.png" />`
		const result = transformAstroSource(source, {
			Picture: [
				{ from: 'src', to: 'src' },
				{ from: 'srcDark', to: 'srcDark' },
			],
		})
		expect(result).toContain('src={light}')
		expect(result).toContain('srcDark={__ami_0}')
		expect(result).toContain('import __ami_0 from "../assets/dark.png"')
	})

	it('derives each import from its configured source prop', () => {
		const source = `---
---
<Picture src="../assets/light.png" sketch="../assets/drawing.tldr" />`
		const result = transformAstroSource(source, {
			Picture: [
				{ from: 'src', to: 'src' },
				{ from: 'sketch', to: 'srcDark', transform: tldrawDarkTransform },
			],
		})
		expect(result).toContain('import __ami_1 from "../assets/drawing.tldr?dark=true&tldr"')
	})

	it('applies transforms that replace their source prop', () => {
		const source = `---
---
<Picture src="../assets/drawing.tldr" />`
		const result = transformAstroSource(source, {
			Picture: [{ from: 'src', to: 'src', transform: tldrawDarkTransform }],
		})
		expect(result).toContain('import __ami_0 from "../assets/drawing.tldr?dark=true&tldr"')
		expect(result).toContain('src={__ami_0}')
	})

	it('supports a transform without a separate primary import', () => {
		const source = `---
---
<Picture src="../assets/drawing.tldr" />`
		const result = transformAstroSource(source, {
			Picture: [{ from: 'src', to: 'srcDark', transform: tldrawDarkTransform }],
		})
		expect(result).toContain('src="../assets/drawing.tldr"')
		expect(result).toContain('srcDark={__ami_0}')
	})

	it('preserves an explicit expression when remapping a prop', () => {
		const expression = '{customImage}'
		const source = `---
---
<Picture source="../assets/light.png" src=${expression} />`
		expect(
			transformAstroSource(source, {
				Picture: [{ from: 'source', to: 'src' }],
			}),
		).toBeUndefined()
	})

	it('honors shouldImport on derived entries', () => {
		const source = `---
---
<Picture src="../assets/drawing.tldr" />`
		expect(
			transformAstroSource(source, {
				Picture: [
					{
						from: 'src',
						shouldImport: () => false,
						to: 'srcDark',
						transform: tldrawDarkTransform,
					},
				],
			}),
		).toBeUndefined()
	})

	it('deduplicates imports for same path', () => {
		const source = `---
---
<Image src="../assets/test.jpeg" alt="First" />
<Image src="../assets/test.jpeg" alt="Second" />
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toBeDefined()
		const importCount = (result!.match(/import __ami_0/gv) ?? []).length
		expect(importCount).toBe(1)
	})

	it('skips expression attributes (curly braces)', () => {
		// Interpolated so the braces aren't mistaken for a missing-`$` template typo
		const expressionAttribute = '{img}'
		const source = `---
import img from '../assets/test.jpeg'
---
<Image src=${expressionAttribute} alt="Already imported" />
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toBeUndefined()
	})

	it('skips HTTP URLs', () => {
		const source = `---
---
<Image src="https://example.com/photo.jpg" alt="Remote" />
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toBeUndefined()
	})

	it('skips data URIs', () => {
		const source = `---
---
<Image src="data:image/png;base64,abc123" alt="Data" />
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toBeUndefined()
	})

	it('does not touch non-target components', () => {
		const source = `---
---
<img src="../assets/test.jpeg" alt="Plain HTML" />
<video src="../assets/video.mp4" />
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toBeUndefined()
	})

	it('handles single-quoted attributes', () => {
		const source = `---
---
<Image src='../assets/test.jpeg' alt="Test" />
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toContain('import __ami_0 from "../assets/test.jpeg"')
		expect(result).toContain('src={__ami_0}')
	})

	it('handles multiline component tags', () => {
		const source = `---
---
<Picture
	src="../assets/photo.png"
	alt="Photo"
	creator="Someone"
/>
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toContain('import __ami_0 from "../assets/photo.png"')
		expect(result).toContain('src={__ami_0}')
	})

	it('adds frontmatter to hold the imports when the file has none', () => {
		const source = '<Image src="../assets/test.jpeg" alt="No frontmatter" />'
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toBe(
			'---\nimport __ami_0 from "../assets/test.jpeg"\n---\n\n<Image src={__ami_0} alt="No frontmatter" />',
		)
	})

	it('leaves a file without frontmatter alone when nothing is imported', () => {
		const source = '<Image src="/images/photo.jpg" alt="Public" width="300" height="200" />'
		expect(transformAstroSource(source, defaultConfig)).toBeUndefined()
	})

	it('handles custom component names', () => {
		const source = `---
---
<MyImage src="../assets/test.jpeg" alt="Custom" />
`
		const config = { MyImage: [{ from: 'src', to: 'src' }] }
		const result = transformAstroSource(source, config)
		expect(result).toContain('import __ami_0 from "../assets/test.jpeg"')
		expect(result).toContain('src={__ami_0}')
	})

	it('preserves existing frontmatter content', () => {
		const source = `---
import { Image } from 'astro-media-kit'
const title = 'Hello'
---
<Image src="../assets/test.jpeg" alt="Test" />
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toContain("import { Image } from 'astro-media-kit'")
		expect(result).toContain("const title = 'Hello'")
		expect(result).toContain('import __ami_0 from "../assets/test.jpeg"')
	})

	it('handles multiple different images', () => {
		const source = `---
---
<Image src="../assets/one.jpeg" alt="One" />
<Picture src="../assets/two.png" alt="Two" />
`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toContain('import __ami_0 from "../assets/one.jpeg"')
		expect(result).toContain('import __ami_1 from "../assets/two.png"')
		expect(result).toContain('src={__ami_0}')
		expect(result).toContain('src={__ami_1}')
	})

	it('auto-generates srcDark for .tldr src on Picture via transform', () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr" alt="Sketch" />
`
		const result = transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).toContain('import __ami_1 from "../assets/sketch.tldr?dark=true&tldr"')
		expect(result).toContain('src={__ami_0}')
		expect(result).toContain('srcDark={__ami_1}')
	})

	it('does not auto-generate srcDark for .tldr on Image (no transform configured)', () => {
		const source = `---
---
<Image src="../assets/sketch.tldr" alt="Sketch" />
`
		const result = transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).not.toContain('dark=true')
		expect(result).not.toContain('srcDark')
	})

	it('replaces existing srcDark when present on component with transform', () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr" srcDark="../assets/custom-dark.tldr" alt="Sketch" />
`
		const result = transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).toContain('import __ami_1 from "../assets/custom-dark.tldr"')
		expect(result).toContain('srcDark={__ami_1}')
	})

	it('does not auto-generate srcDark for non-.tldr files on Picture', () => {
		const source = `---
---
<Picture src="../assets/photo.png" alt="Photo" />
`
		const result = transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/photo.png"')
		expect(result).not.toContain('srcDark')
	})

	it('does not insert srcDark when srcDark={false} (expression attribute)', () => {
		// Interpolated so the braces aren't mistaken for a missing-`$` template typo
		const expressionAttribute = '{false}'
		const source = `---
---
<Picture src="../assets/sketch.tldr" srcDark=${expressionAttribute} alt="Sketch" />
`
		const result = transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).not.toContain('srcDark={__ami')
	})

	it('auto-generates srcDark for .tldr with existing query params', () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr?frame=my-frame&tldr" alt="Sketch" />
`
		const result = transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr?frame=my-frame&tldr"')
		expect(result).toContain(
			'import __ami_1 from "../assets/sketch.tldr?frame=my-frame&tldr&dark=true&tldr"',
		)
		expect(result).toContain('srcDark={__ami_1}')
	})
})

describe('auto-import paths in the consumer project', () => {
	let temporaryDirectory: string
	let directories: { publicDir: URL; root: URL }

	beforeAll(async () => {
		temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'astro-media-kit-import-'))
		const root = nodePath.join(temporaryDirectory, 'site')
		const publicDirectory = nodePath.join(temporaryDirectory, 'static')
		await mkdir(nodePath.join(root, 'src', 'assets'), { recursive: true })
		await mkdir(nodePath.join(publicDirectory, 'src', 'assets'), { recursive: true })
		await writeFile(nodePath.join(root, 'src', 'assets', 'photo.jpg'), '')
		await writeFile(nodePath.join(root, 'src', 'assets', 'collision.jpg'), '')
		await writeFile(nodePath.join(publicDirectory, 'src', 'assets', 'collision.jpg'), '')
		directories = { publicDir: pathToFileURL(publicDirectory), root: pathToFileURL(root) }
	})

	afterAll(async () => {
		await rm(temporaryDirectory, { force: true, recursive: true })
	})

	it('imports a Vite root path using the configured root rather than the working directory', () => {
		const source = `---
---
<Image src="/src/assets/photo.jpg" alt="Photo" />`
		const result = transformAstroSource(source, defaultConfig, directories)
		expect(result).toContain('import __ami_0 from "/src/assets/photo.jpg"')
		expect(result).toContain('src={__ami_0}')
	})

	it('keeps query parameters on root imports', () => {
		const source = `---
---
<Image src="/src/assets/photo.jpg?custom" alt="Photo" />`
		const result = transformAstroSource(source, defaultConfig, directories)
		expect(result).toContain('import __ami_0 from "/src/assets/photo.jpg?custom"')
	})

	it('imports an absolute filesystem path without needing project directories', () => {
		const file = nodePath.join(fileURLToPath(directories.root), 'src', 'assets', 'photo.jpg')
		const source = `---
---
<Image src="${file}" alt="Photo" />`
		const result = transformAstroSource(source, defaultConfig)
		expect(result).toContain(`from ${JSON.stringify(file)}`)
		expect(result).toContain('src={__ami_0}')
	})

	it('preserves a public URL when the configured public directory and root both contain it', () => {
		const source = `---
---
<Image src="/src/assets/collision.jpg" alt="Photo" width="300" height="200" />`
		expect(transformAstroSource(source, defaultConfig, directories)).toBeUndefined()
	})

	it('preserves remote and protocol-relative URLs even when their paths resemble imports', () => {
		const source = `---
---
<Image src="https://example.com/src/assets/photo.jpg" alt="Photo" width="300" height="200" />
<Image src="//example.com/src/assets/photo.jpg" alt="Photo" width="300" height="200" />`
		expect(transformAstroSource(source, defaultConfig, directories)).toBeUndefined()
	})
})

describe('needsBackgroundDarkVariant', () => {
	describe('media mode (isSelector=false)', () => {
		it('returns true for opaque format with different backgroundDark', () => {
			expect(needsBackgroundDarkVariant(['jpg'], 'white', 'black', false, false)).toBe(true)
			expect(needsBackgroundDarkVariant(['jpeg'], 'white', 'black', false, false)).toBe(true)
		})

		it('returns true when opaque format is among transparent formats', () => {
			expect(needsBackgroundDarkVariant(['webp', 'jpg'], 'white', 'black', false, false)).toBe(true)
		})

		it('returns false for transparent-only formats (CSS light-dark() handles it)', () => {
			expect(needsBackgroundDarkVariant(['webp'], 'white', 'black', false, false)).toBe(false)
			expect(needsBackgroundDarkVariant(['png'], 'white', 'black', false, false)).toBe(false)
			expect(needsBackgroundDarkVariant(['avif'], 'white', 'black', false, false)).toBe(false)
			expect(needsBackgroundDarkVariant(['svg'], 'white', 'black', false, false)).toBe(false)
			expect(
				needsBackgroundDarkVariant(['webp', 'png', 'avif'], 'white', 'black', false, false),
			).toBe(false)
		})

		it('returns false when backgroundDark is not set', () => {
			expect(needsBackgroundDarkVariant(['jpg'], 'white', undefined, false, false)).toBe(false)
		})

		it('returns false when backgroundDark equals background', () => {
			expect(needsBackgroundDarkVariant(['jpg'], 'white', 'white', false, false)).toBe(false)
		})

		it('returns false when darkDisabled is true', () => {
			expect(needsBackgroundDarkVariant(['jpg'], 'white', 'black', true, false)).toBe(false)
		})

		it('returns true when background is undefined but backgroundDark is set', () => {
			expect(needsBackgroundDarkVariant(['jpg'], undefined, 'black', false, false)).toBe(true)
		})
	})

	describe('selector mode (isSelector=true)', () => {
		// Selector-mode dark mode can't use CSS light-dark() (it only responds to
		// prefers-color-scheme), so a separate <picture> must carry the swapped
		// inline background-color — even for transparent formats where the image
		// bytes are identical.
		it('returns true for transparent formats with different backgroundDark', () => {
			expect(needsBackgroundDarkVariant(['webp'], 'white', 'black', false, true)).toBe(true)
			expect(needsBackgroundDarkVariant(['png'], 'white', 'black', false, true)).toBe(true)
			expect(needsBackgroundDarkVariant(['avif'], 'white', 'black', false, true)).toBe(true)
			expect(needsBackgroundDarkVariant(['svg'], 'white', 'black', false, true)).toBe(true)
		})

		it('returns true for opaque formats with different backgroundDark', () => {
			expect(needsBackgroundDarkVariant(['jpg'], 'white', 'black', false, true)).toBe(true)
		})

		it('returns true when background is undefined but backgroundDark is set on a transparent format', () => {
			expect(needsBackgroundDarkVariant(['webp'], undefined, 'black', false, true)).toBe(true)
		})

		it('returns false when backgroundDark is not set (nothing to toggle to)', () => {
			expect(needsBackgroundDarkVariant(['webp'], 'white', undefined, false, true)).toBe(false)
		})

		it('returns false when backgroundDark equals background', () => {
			expect(needsBackgroundDarkVariant(['webp'], 'white', 'white', false, true)).toBe(false)
		})

		it('returns false when darkDisabled is true', () => {
			expect(needsBackgroundDarkVariant(['webp'], 'white', 'black', true, true)).toBe(false)
		})
	})
})
