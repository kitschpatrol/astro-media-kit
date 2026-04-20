import { describe, expect, it, vi } from 'vitest'
import type { GetImageResult } from '../src/components/utils/image-orchestration'
import {
	assertNotRelativePath,
	buildBackgroundStyle,
	buildSrcsetAttribute,
	cloneImageMetadata,
	compositingBackground,
	extractScopedStyleClass,
	getMimeType,
	isESMImportedImage,
	pickFallbackFormat,
	propagateAstroCidAttributes,
	resolveSrc,
	resolveSrcToMetadata,
	warnBackgroundDarkWithoutBackground,
	warnWidthsWithoutSizes,
} from '../src/components/utils/image-orchestration'

const pngMeta = { format: 'png' as const, height: 100, src: '/img.png', width: 200 }
const jpgMeta = { format: 'jpg' as const, height: 100, src: '/img.jpg', width: 200 }
const svgMeta = { format: 'svg' as const, height: 100, src: '/img.svg', width: 200 }
const gifMeta = { format: 'gif' as const, height: 100, src: '/img.gif', width: 200 }
const webpMeta = { format: 'webp' as const, height: 100, src: '/img.webp', width: 200 }

const imageRelativePathError = /Image received a relative string path/
const pictureRelativePathError = /Picture received a relative string path/
const relativePathError = /relative string path/

const noop = (): void => undefined

describe('pickFallbackFormat', () => {
	it('returns the explicit fallbackFormatProp when provided', () => {
		expect(pickFallbackFormat('avif', pngMeta)).toBe('avif')
		expect(pickFallbackFormat('webp', svgMeta)).toBe('webp')
	})

	it('keeps gif/svg/jpg/jpeg in-format (transparency-aware fallback)', () => {
		expect(pickFallbackFormat(undefined, svgMeta)).toBe('svg')
		expect(pickFallbackFormat(undefined, gifMeta)).toBe('gif')
		expect(pickFallbackFormat(undefined, jpgMeta)).toBe('jpg')
	})

	it('defaults to png for png/webp/avif inputs', () => {
		expect(pickFallbackFormat(undefined, pngMeta)).toBe('png')
		expect(pickFallbackFormat(undefined, webpMeta)).toBe('png')
	})

	it('defaults to png for string-path inputs (no format info)', () => {
		expect(pickFallbackFormat(undefined, '/img.png')).toBe('png')
	})
})

describe('compositingBackground', () => {
	it('emits background for opaque JPEG formats', () => {
		expect(compositingBackground('jpeg', '#fff')).toEqual({ background: '#fff' })
		expect(compositingBackground('jpg', '#000')).toEqual({ background: '#000' })
	})

	it('omits background for transparent formats', () => {
		expect(compositingBackground('png', '#fff')).toEqual({})
		expect(compositingBackground('webp', '#fff')).toEqual({})
		expect(compositingBackground('svg', '#fff')).toEqual({})
	})

	it('omits when background is not set', () => {
		expect(compositingBackground('jpg')).toEqual({})
	})
})

describe('buildBackgroundStyle', () => {
	it('returns plain background-color for both variants in selector mode', () => {
		expect(
			buildBackgroundStyle({ background: '#abc', backgroundDark: '#123', isSelector: true }),
		).toEqual({ dark: 'background-color:#123', light: 'background-color:#abc' })
	})

	it('falls back to background for dark style when backgroundDark is missing (selector mode)', () => {
		expect(
			buildBackgroundStyle({ background: '#abc', backgroundDark: undefined, isSelector: true }),
		).toEqual({ dark: 'background-color:#abc', light: 'background-color:#abc' })
	})

	it('uses light-dark() in media mode when both are set', () => {
		expect(
			buildBackgroundStyle({ background: '#abc', backgroundDark: '#123', isSelector: false }),
		).toEqual({
			dark: undefined,
			light: 'color-scheme:light dark;background-color:light-dark(#abc,#123)',
		})
	})

	it('uses light-dark(transparent,...) in media mode when only backgroundDark is set', () => {
		expect(
			buildBackgroundStyle({ background: undefined, backgroundDark: '#123', isSelector: false }),
		).toEqual({
			dark: undefined,
			light: 'color-scheme:light dark;background-color:light-dark(transparent,#123)',
		})
	})

	it('emits plain background-color in media mode when only background is set', () => {
		expect(
			buildBackgroundStyle({ background: '#abc', backgroundDark: undefined, isSelector: false }),
		).toEqual({ dark: undefined, light: 'background-color:#abc' })
	})

	it('returns both undefined when neither color is set', () => {
		expect(
			buildBackgroundStyle({ background: undefined, backgroundDark: undefined, isSelector: false }),
		).toEqual({ dark: undefined, light: undefined })
	})
})

describe('isESMImportedImage', () => {
	it('accepts plain ImageMetadata objects', () => {
		expect(isESMImportedImage(pngMeta)).toBe(true)
	})

	it('accepts SVG component function wrappers', () => {
		// eslint-disable-next-line ts/no-empty-function -- simulates Astro SVG component function
		const svgFn = Object.assign(() => {}, { src: '/img.svg' })
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- function-with-src simulates Astro's SVG wrapper shape
		expect(isESMImportedImage(svgFn as unknown as typeof pngMeta)).toBe(true)
	})

	it('rejects string paths', () => {
		expect(isESMImportedImage('/img.png')).toBe(false)
	})
})

describe('extractScopedStyleClass', () => {
	it('extracts astro-XXXXXXXX class when present', () => {
		expect(extractScopedStyleClass('foo astro-ab12cd34 bar')).toBe('astro-ab12cd34')
	})

	it('returns undefined when no scoped class is present', () => {
		expect(extractScopedStyleClass('foo bar')).toBeUndefined()
		expect(extractScopedStyleClass()).toBeUndefined()
	})

	it('ignores astro-* with wrong length', () => {
		expect(extractScopedStyleClass('astro-short')).toBeUndefined()
		expect(extractScopedStyleClass('astro-ab12cd3')).toBeUndefined()
	})
})

describe('propagateAstroCidAttrs', () => {
	it('forwards every data-astro-cid-* key', () => {
		const from = {
			'data-astro-cid-abc': 'xyz',
			'data-astro-cid-def': 'uvw',
			other: 'ignored',
		}
		const to: Record<string, unknown> = {}
		propagateAstroCidAttributes(from, to)
		expect(to).toEqual({
			'data-astro-cid-abc': 'xyz',
			'data-astro-cid-def': 'uvw',
		})
	})

	it('leaves existing target keys intact for non-matching attrs', () => {
		const from = { other: 'ignored' }
		const to: Record<string, unknown> = { keep: 'this' }
		propagateAstroCidAttributes(from, to)
		expect(to).toEqual({ keep: 'this' })
	})
})

describe('assertNotRelativePath', () => {
	it('throws on ./ and ../ paths', () => {
		expect(() => {
			assertNotRelativePath('./foo.png', 'Image')
		}).toThrow(imageRelativePathError)
		expect(() => {
			assertNotRelativePath('../bar.png', 'Picture')
		}).toThrow(pictureRelativePathError)
	})

	it('accepts absolute paths', () => {
		expect(() => {
			assertNotRelativePath('/abs/foo.png', 'Image')
		}).not.toThrow()
	})

	it('accepts non-string values', () => {
		expect(() => {
			assertNotRelativePath(undefined, 'Image')
		}).not.toThrow()
		expect(() => {
			assertNotRelativePath(pngMeta, 'Image')
		}).not.toThrow()
	})
})

describe('resolveSrc', () => {
	it('passes through plain ImageMetadata', async () => {
		await expect(resolveSrc(pngMeta)).resolves.toBe(pngMeta)
	})

	it('passes through string paths', async () => {
		await expect(resolveSrc('/img.png')).resolves.toBe('/img.png')
	})

	it('unwraps Promise-of-default-export shape', async () => {
		const promise = Promise.resolve({ default: pngMeta })
		await expect(resolveSrc(promise)).resolves.toBe(pngMeta)
	})
})

describe('cloneImageMetadata', () => {
	it('prefers the private .clone property when present', () => {
		const clone = { ...pngMeta }
		const withClone: typeof pngMeta & { clone: typeof pngMeta } = { ...pngMeta, clone }
		expect(cloneImageMetadata(withClone)).toBe(clone)
	})

	it('falls back to the original when no clone is present', () => {
		expect(cloneImageMetadata(pngMeta)).toBe(pngMeta)
	})

	it('passes strings through unchanged', () => {
		expect(cloneImageMetadata('/img.png')).toBe('/img.png')
	})
})

// Build a minimal GetImageResult stub for srcset/mime tests. The real type has
// heavy generics we don't need to exercise here.
function stubImage(
	options: {
		format?: string
		src?: string
		srcsetAttribute?: string
		srcsetValues?: number
	} = {},
): GetImageResult {
	const {
		format = 'webp',
		src = '/_astro/img.webp',
		srcsetAttribute = '',
		srcsetValues = 0,
	} = options
	return {
		attributes: {},
		options: { format, src },
		rawOptions: { format, src },
		src,
		srcSet: {
			attribute: srcsetAttribute,
			values: Array.from({ length: srcsetValues }, (_, i) => ({
				descriptor: `${String(i + 1)}x`,
				transform: { src },
				url: `/_astro/img-${String(i + 1)}.webp`,
			})),
		},
	}
}

describe('buildSrcsetAttribute', () => {
	it('prepends base src when densities are set', () => {
		const img = stubImage({ srcsetAttribute: '/2x.webp 2x', srcsetValues: 1 })
		expect(buildSrcsetAttribute(img, { densities: [1, 2] }, false)).toBe(
			'/_astro/img.webp, /2x.webp 2x',
		)
	})

	it('returns just the base src when densities are set but srcset has no variants', () => {
		const img = stubImage({ srcsetAttribute: '', srcsetValues: 0 })
		expect(buildSrcsetAttribute(img, { densities: [1] }, false)).toBe('/_astro/img.webp')
	})

	it('prepends base src when neither widths nor useResponsive are set', () => {
		const img = stubImage({ srcsetAttribute: '/400.webp 400w', srcsetValues: 1 })
		expect(buildSrcsetAttribute(img, {}, false)).toBe('/_astro/img.webp, /400.webp 400w')
	})

	it('uses srcSet.attribute directly when widths are set', () => {
		const img = stubImage({ srcsetAttribute: '/400.webp 400w, /800.webp 800w', srcsetValues: 2 })
		expect(buildSrcsetAttribute(img, { widths: [400, 800] }, false)).toBe(
			'/400.webp 400w, /800.webp 800w',
		)
	})

	it('uses srcSet.attribute directly when useResponsive is true', () => {
		const img = stubImage({ srcsetAttribute: '/400.webp 400w', srcsetValues: 1 })
		expect(buildSrcsetAttribute(img, {}, true)).toBe('/400.webp 400w')
	})
})

describe('getMimeType', () => {
	it('looks up MIME from options.format when present', () => {
		expect(getMimeType(stubImage({ format: 'webp', src: '/foo.webp' }))).toBe('image/webp')
		expect(getMimeType(stubImage({ format: 'jpg', src: '/foo.jpg' }))).toBe('image/jpeg')
		expect(getMimeType(stubImage({ format: 'svg', src: '/foo.svg' }))).toBe('image/svg+xml')
	})
})

describe('warnBackgroundDarkWithoutBackground', () => {
	it('warns when backgroundDark is set alone', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(noop)
		warnBackgroundDarkWithoutBackground(undefined, '#000', 'Image')
		expect(spy).toHaveBeenCalledWith(expect.stringContaining('Image'))
		expect(spy).toHaveBeenCalledWith(expect.stringContaining('backgroundDark'))
		spy.mockRestore()
	})

	it('does not warn when background is also set', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(noop)
		warnBackgroundDarkWithoutBackground('#fff', '#000', 'Image')
		expect(spy).not.toHaveBeenCalled()
		spy.mockRestore()
	})

	it('does not warn when neither is set', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(noop)
		warnBackgroundDarkWithoutBackground(undefined, undefined, 'Picture')
		expect(spy).not.toHaveBeenCalled()
		spy.mockRestore()
	})
})

describe('warnWidthsWithoutSizes', () => {
	it('warns when widths are set but no sizes/densities/responsive', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(noop)
		warnWidthsWithoutSizes('/img.png', { widths: [100, 200] }, false, 'Picture')
		expect(spy).toHaveBeenCalledWith(expect.stringContaining('Picture'))
		expect(spy).toHaveBeenCalledWith(expect.stringContaining('/img.png'))
		spy.mockRestore()
	})

	it('does not warn when sizes is set', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(noop)
		warnWidthsWithoutSizes(
			'/img.png',
			{ sizes: '(min-width: 640px) 50vw, 100vw', widths: [100, 200] },
			false,
			'Picture',
		)
		expect(spy).not.toHaveBeenCalled()
		spy.mockRestore()
	})

	it('does not warn when densities are set', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(noop)
		warnWidthsWithoutSizes('/img.png', { densities: [1, 2], widths: [100, 200] }, false, 'Picture')
		expect(spy).not.toHaveBeenCalled()
		spy.mockRestore()
	})

	it('does not warn when useResponsive is true', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(noop)
		warnWidthsWithoutSizes('/img.png', { widths: [100, 200] }, true, 'Picture')
		expect(spy).not.toHaveBeenCalled()
		spy.mockRestore()
	})

	it('does not warn when widths is empty', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(noop)
		warnWidthsWithoutSizes('/img.png', { widths: [] }, false, 'Picture')
		expect(spy).not.toHaveBeenCalled()
		spy.mockRestore()
	})
})

describe('resolveSrcToMetadata', () => {
	it('picks .light from a DarkLight pair when no srcDark is given', async () => {
		const dark = { ...pngMeta, src: '/dark.png' }
		const { imageMetadata, imageMetadataDark } = await resolveSrcToMetadata(
			{ dark, light: pngMeta },
			undefined,
			{ componentName: 'Picture', darkDisabled: false },
		)
		expect(imageMetadata).toBe(pngMeta)
		expect(imageMetadataDark).toBe(dark)
	})

	it('drops the .dark variant when darkDisabled is true', async () => {
		const dark = { ...pngMeta, src: '/dark.png' }
		const { imageMetadata, imageMetadataDark } = await resolveSrcToMetadata(
			{ dark, light: pngMeta },
			undefined,
			{ componentName: 'Image', darkDisabled: true },
		)
		expect(imageMetadata).toBe(pngMeta)
		expect(imageMetadataDark).toBeUndefined()
	})

	it('returns just imageMetadata for a plain ImageMetadata input', async () => {
		const { imageMetadata, imageMetadataDark } = await resolveSrcToMetadata(pngMeta, undefined, {
			componentName: 'Image',
			darkDisabled: true,
		})
		expect(imageMetadata).toBe(pngMeta)
		expect(imageMetadataDark).toBeUndefined()
	})

	it('uses explicit srcDark ImageMetadata over the .dark member of the pair', async () => {
		const dark = { ...pngMeta, src: '/pair-dark.png' }
		const explicitDark = { ...pngMeta, src: '/explicit-dark.png' }
		const { imageMetadataDark } = await resolveSrcToMetadata(
			{ dark, light: pngMeta },
			explicitDark,
			{ componentName: 'Picture', darkDisabled: false },
		)
		expect(imageMetadataDark).toBe(explicitDark)
	})

	it('throws on relative string src', async () => {
		await expect(
			resolveSrcToMetadata('./foo.png', undefined, {
				componentName: 'Image',
				darkDisabled: true,
			}),
		).rejects.toThrow(relativePathError)
	})

	it('throws on relative string srcDark', async () => {
		await expect(
			resolveSrcToMetadata(pngMeta, '../dark.png', {
				componentName: 'Picture',
				darkDisabled: false,
			}),
		).rejects.toThrow(relativePathError)
	})
})
