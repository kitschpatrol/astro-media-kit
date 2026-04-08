/* eslint-disable ts/naming-convention */

import { describe, expect, it } from 'vitest'
import { transformAstroSource } from '../src/integration/auto-import.ts'
import { needsBackgroundDarkVariant } from '../src/utilities/dark-variant.ts'

const TLDRAW_EXTENSION_REGEX = /\.tldr(?:\?|$)/

// Default config: Image and Picture both auto-import 'src'
const defaultConfig = {
	Image: [{ fromProp: 'src', toProp: 'src' }],
	Picture: [{ fromProp: 'src', toProp: 'src' }],
}

// Config with .tldr dark mode transform on Picture
const tldrawDarkTransform = (path: string) =>
	TLDRAW_EXTENSION_REGEX.test(path)
		? `${path}${path.includes('?') ? '&' : '?'}dark=true&tldr`
		: undefined

const configWithTldrawDark = {
	Image: [{ fromProp: 'src', toProp: 'src' }],
	Picture: [
		{ fromProp: 'src', toProp: 'src' },
		{ fromProp: 'src', toProp: 'srcDark', transform: tldrawDarkTransform },
	],
}

describe('transformAstroSource', () => {
	it('injects import and rewrites src for Image', async () => {
		const source = `---
import { Image } from 'astro-media-kit'
---
<Image src="../assets/test.jpeg" alt="Blep" />
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toContain('import __ami_0 from "../assets/test.jpeg"')
		expect(result).toContain('src={__ami_0}')
		expect(result).not.toContain('src="../assets/test.jpeg"')
	})

	it('injects import and rewrites src for Picture', async () => {
		const source = `---
---
<Picture src="../assets/photo.png" alt="Photo" />
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toContain('import __ami_0 from "../assets/photo.png"')
		expect(result).toContain('src={__ami_0}')
	})

	it('handles srcDark attribute', async () => {
		const source = `---
---
<Picture src="../assets/light.png" srcDark="../assets/dark.png" alt="Theme" />
`
		// Config that auto-imports both src and srcDark
		const config = {
			Picture: [
				{ fromProp: 'src', toProp: 'src' },
				{ fromProp: 'srcDark', toProp: 'srcDark' },
			],
		}
		const result = await transformAstroSource(source, config)
		expect(result).toContain('import __ami_0 from "../assets/light.png"')
		expect(result).toContain('import __ami_1 from "../assets/dark.png"')
		expect(result).toContain('src={__ami_0}')
		expect(result).toContain('srcDark={__ami_1}')
	})

	it('deduplicates imports for same path', async () => {
		const source = `---
---
<Image src="../assets/test.jpeg" alt="First" />
<Image src="../assets/test.jpeg" alt="Second" />
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toBeDefined()
		const importCount = (result!.match(/import __ami_0/g) ?? []).length
		expect(importCount).toBe(1)
	})

	it('skips expression attributes (curly braces)', async () => {
		const source = `---
import img from '../assets/test.jpeg'
---
<Image src={img} alt="Already imported" />
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toBeUndefined()
	})

	it('skips HTTP URLs', async () => {
		const source = `---
---
<Image src="https://example.com/photo.jpg" alt="Remote" />
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toBeUndefined()
	})

	it('skips data URIs', async () => {
		const source = `---
---
<Image src="data:image/png;base64,abc123" alt="Data" />
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toBeUndefined()
	})

	it('does not touch non-target components', async () => {
		const source = `---
---
<img src="../assets/test.jpeg" alt="Plain HTML" />
<video src="../assets/video.mp4" />
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toBeUndefined()
	})

	it('handles single-quoted attributes', async () => {
		const source = `---
---
<Image src='../assets/test.jpeg' alt="Test" />
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toContain('import __ami_0 from "../assets/test.jpeg"')
		expect(result).toContain('src={__ami_0}')
	})

	it('handles multiline component tags', async () => {
		const source = `---
---
<Picture
	src="../assets/photo.png"
	alt="Photo"
	creator="Someone"
/>
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toContain('import __ami_0 from "../assets/photo.png"')
		expect(result).toContain('src={__ami_0}')
	})

	it('returns undefined when no frontmatter present', async () => {
		const source = '<Image src="../assets/test.jpeg" alt="No frontmatter" />'
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toBeUndefined()
	})

	it('handles custom component names', async () => {
		const source = `---
---
<MyImage src="../assets/test.jpeg" alt="Custom" />
`
		const config = { MyImage: [{ fromProp: 'src', toProp: 'src' }] }
		const result = await transformAstroSource(source, config)
		expect(result).toContain('import __ami_0 from "../assets/test.jpeg"')
		expect(result).toContain('src={__ami_0}')
	})

	it('preserves existing frontmatter content', async () => {
		const source = `---
import { Image } from 'astro-media-kit'
const title = 'Hello'
---
<Image src="../assets/test.jpeg" alt="Test" />
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toContain("import { Image } from 'astro-media-kit'")
		expect(result).toContain("const title = 'Hello'")
		expect(result).toContain('import __ami_0 from "../assets/test.jpeg"')
	})

	it('handles multiple different images', async () => {
		const source = `---
---
<Image src="../assets/one.jpeg" alt="One" />
<Picture src="../assets/two.png" alt="Two" />
`
		const result = await transformAstroSource(source, defaultConfig)
		expect(result).toContain('import __ami_0 from "../assets/one.jpeg"')
		expect(result).toContain('import __ami_1 from "../assets/two.png"')
		expect(result).toContain('src={__ami_0}')
		expect(result).toContain('src={__ami_1}')
	})

	it('auto-generates srcDark for .tldr src on Picture via transform', async () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr" alt="Sketch" />
`
		const result = await transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).toContain('import __ami_1 from "../assets/sketch.tldr?dark=true&tldr"')
		expect(result).toContain('src={__ami_0}')
		expect(result).toContain('srcDark={__ami_1}')
	})

	it('does not auto-generate srcDark for .tldr on Image (no transform configured)', async () => {
		const source = `---
---
<Image src="../assets/sketch.tldr" alt="Sketch" />
`
		const result = await transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).not.toContain('dark=true')
		expect(result).not.toContain('srcDark')
	})

	it('replaces existing srcDark when present on component with transform', async () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr" srcDark="../assets/custom-dark.tldr" alt="Sketch" />
`
		const result = await transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).toContain('import __ami_1 from "../assets/custom-dark.tldr"')
		expect(result).toContain('srcDark={__ami_1}')
	})

	it('does not auto-generate srcDark for non-.tldr files on Picture', async () => {
		const source = `---
---
<Picture src="../assets/photo.png" alt="Photo" />
`
		const result = await transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/photo.png"')
		expect(result).not.toContain('srcDark')
	})

	it('does not insert srcDark when srcDark={false} (expression attribute)', async () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr" srcDark={false} alt="Sketch" />
`
		const result = await transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).not.toContain('srcDark={__ami')
	})

	it('auto-generates srcDark for .tldr with existing query params', async () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr?frame=my-frame&tldr" alt="Sketch" />
`
		const result = await transformAstroSource(source, configWithTldrawDark)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr?frame=my-frame&tldr"')
		expect(result).toContain(
			'import __ami_1 from "../assets/sketch.tldr?frame=my-frame&tldr&dark=true&tldr"',
		)
		expect(result).toContain('srcDark={__ami_1}')
	})
})

describe('needsBackgroundDarkVariant', () => {
	it('returns true for opaque format with different backgroundDark', () => {
		expect(needsBackgroundDarkVariant(['jpg'], 'white', 'black', false)).toBe(true)
		expect(needsBackgroundDarkVariant(['jpeg'], 'white', 'black', false)).toBe(true)
	})

	it('returns true when opaque format is among transparent formats', () => {
		expect(needsBackgroundDarkVariant(['webp', 'jpg'], 'white', 'black', false)).toBe(true)
	})

	it('returns false for transparent-only formats', () => {
		expect(needsBackgroundDarkVariant(['webp'], 'white', 'black', false)).toBe(false)
		expect(needsBackgroundDarkVariant(['png'], 'white', 'black', false)).toBe(false)
		expect(needsBackgroundDarkVariant(['avif'], 'white', 'black', false)).toBe(false)
		expect(needsBackgroundDarkVariant(['svg'], 'white', 'black', false)).toBe(false)
		expect(needsBackgroundDarkVariant(['webp', 'png', 'avif'], 'white', 'black', false)).toBe(false)
	})

	it('returns false when backgroundDark is not set', () => {
		expect(needsBackgroundDarkVariant(['jpg'], 'white', undefined, false)).toBe(false)
	})

	it('returns false when backgroundDark equals background', () => {
		expect(needsBackgroundDarkVariant(['jpg'], 'white', 'white', false)).toBe(false)
	})

	it('returns false when darkDisabled is true', () => {
		expect(needsBackgroundDarkVariant(['jpg'], 'white', 'black', true)).toBe(false)
	})

	it('returns true when background is undefined but backgroundDark is set', () => {
		expect(needsBackgroundDarkVariant(['jpg'], undefined, 'black', false)).toBe(true)
	})
})
