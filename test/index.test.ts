import { describe, expect, it } from 'vitest'
import { transformAstroSource } from '../src/integration/index.ts'
import { needsBackgroundDarkVariant } from '../src/utilities/dark-variant.ts'

const defaultComponents = ['Image', 'Picture']

describe('transformAstroSource', () => {
	it('injects import and rewrites src for Image', () => {
		const source = `---
import { Image } from 'astro-media-kit'
---
<Image src="../assets/test.jpeg" alt="Blep" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toContain('import __ami_0 from "../assets/test.jpeg"')
		expect(result).toContain('src={__ami_0}')
		expect(result).not.toContain('src="../assets/test.jpeg"')
	})

	it('injects import and rewrites src for Picture', () => {
		const source = `---
---
<Picture src="../assets/photo.png" alt="Photo" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toContain('import __ami_0 from "../assets/photo.png"')
		expect(result).toContain('src={__ami_0}')
	})

	it('handles srcDark attribute', () => {
		const source = `---
---
<Picture src="../assets/light.png" srcDark="../assets/dark.png" alt="Theme" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toContain('import __ami_0 from "../assets/light.png"')
		expect(result).toContain('import __ami_1 from "../assets/dark.png"')
		expect(result).toContain('src={__ami_0}')
		expect(result).toContain('srcDark={__ami_1}')
	})

	it('deduplicates imports for same path', () => {
		const source = `---
---
<Image src="../assets/test.jpeg" alt="First" />
<Image src="../assets/test.jpeg" alt="Second" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).not.toBeUndefined()
		const importCount = (result!.match(/import __ami_0/g) ?? []).length
		expect(importCount).toBe(1)
	})

	it('skips expression attributes (curly braces)', () => {
		const source = `---
import img from '../assets/test.jpeg'
---
<Image src={img} alt="Already imported" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toBeUndefined()
	})

	it('skips HTTP URLs', () => {
		const source = `---
---
<Image src="https://example.com/photo.jpg" alt="Remote" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toBeUndefined()
	})

	it('skips data URIs', () => {
		const source = `---
---
<Image src="data:image/png;base64,abc123" alt="Data" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toBeUndefined()
	})

	it('does not touch non-target components', () => {
		const source = `---
---
<img src="../assets/test.jpeg" alt="Plain HTML" />
<video src="../assets/video.mp4" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toBeUndefined()
	})

	it('handles single-quoted attributes', () => {
		const source = `---
---
<Image src='../assets/test.jpeg' alt="Test" />
`
		const result = transformAstroSource(source, defaultComponents)
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
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toContain('import __ami_0 from "../assets/photo.png"')
		expect(result).toContain('src={__ami_0}')
	})

	it('returns null when no frontmatter present', () => {
		const source = '<Image src="../assets/test.jpeg" alt="No frontmatter" />'
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toBeUndefined()
	})

	it('handles custom component names', () => {
		const source = `---
---
<MyImage src="../assets/test.jpeg" alt="Custom" />
`
		const result = transformAstroSource(source, ['MyImage'])
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
		const result = transformAstroSource(source, defaultComponents)
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
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toContain('import __ami_0 from "../assets/one.jpeg"')
		expect(result).toContain('import __ami_1 from "../assets/two.png"')
		expect(result).toContain('src={__ami_0}')
		expect(result).toContain('src={__ami_1}')
	})

	it('auto-generates srcDark for .tldr src on Picture', () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr" alt="Sketch" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).toContain('import __ami_1 from "../assets/sketch.tldr?dark=true&tldr"')
		expect(result).toContain('src={__ami_0}')
		expect(result).toContain('srcDark={__ami_1}')
	})

	it('does not auto-generate srcDark for .tldr on Image', () => {
		const source = `---
---
<Image src="../assets/sketch.tldr" alt="Sketch" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).not.toContain('dark=true')
		expect(result).not.toContain('srcDark')
	})

	it('does not auto-generate srcDark for .tldr when srcDark is already set', () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr" srcDark="../assets/custom-dark.tldr" alt="Sketch" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).toContain('import __ami_1 from "../assets/custom-dark.tldr"')
		expect(result).toContain('srcDark={__ami_1}')
		// Should not have the auto-generated dark import
		expect(result).not.toContain('dark=true&tldr')
	})

	it('does not auto-generate srcDark for non-.tldr files on Picture', () => {
		const source = `---
---
<Picture src="../assets/photo.png" alt="Photo" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toContain('import __ami_0 from "../assets/photo.png"')
		expect(result).not.toContain('srcDark')
	})

	it('does not auto-generate srcDark for .tldr when srcDark={false}', () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr" srcDark={false} alt="Sketch" />
`
		const result = transformAstroSource(source, defaultComponents)
		expect(result).toContain('import __ami_0 from "../assets/sketch.tldr"')
		expect(result).not.toContain('dark=true')
		expect(result).not.toContain('srcDark={__ami')
	})

	it('auto-generates srcDark for .tldr with existing query params', () => {
		const source = `---
---
<Picture src="../assets/sketch.tldr?frame=my-frame&tldr" alt="Sketch" />
`
		const result = transformAstroSource(source, defaultComponents)
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
