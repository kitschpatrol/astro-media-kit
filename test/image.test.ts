import { describe, expect, it } from 'vitest'
import { isDarkLightImageMetadata, isImageMetadataObject } from '../src/components/utils/image'

const validMetadata = { format: 'png', height: 100, src: '/image.png', width: 200 }

describe('isImageMetadataObject', () => {
	it('accepts valid ImageMetadata objects', () => {
		expect(isImageMetadataObject(validMetadata)).toBe(true)
	})

	it('accepts objects with just a string src', () => {
		expect(isImageMetadataObject({ src: '/test.jpg' })).toBe(true)
	})

	it('accepts SVG component wrappers with .meta', () => {
		// eslint-disable-next-line ts/no-empty-function -- simulates Astro SVG component wrapper
		const svgComponent = Object.assign(() => {}, { meta: validMetadata })
		expect(isImageMetadataObject(svgComponent)).toBe(true)
	})

	it('rejects null and undefined', () => {
		// eslint-disable-next-line unicorn/no-null -- testing guard against null input
		expect(isImageMetadataObject(null)).toBe(false)
		// eslint-disable-next-line unicorn/no-useless-undefined -- testing explicit undefined input
		expect(isImageMetadataObject(undefined)).toBe(false)
	})

	it('rejects primitives', () => {
		expect(isImageMetadataObject('string')).toBe(false)
		expect(isImageMetadataObject(42)).toBe(false)
		expect(isImageMetadataObject(true)).toBe(false)
	})

	it('rejects objects without src', () => {
		expect(isImageMetadataObject({ format: 'png', height: 100, width: 200 })).toBe(false)
	})

	it('rejects objects with non-string src', () => {
		expect(isImageMetadataObject({ src: 42 })).toBe(false)
	})

	it('rejects SVG wrappers with invalid meta', () => {
		expect(isImageMetadataObject({ meta: 'not-an-object' })).toBe(false)
		// eslint-disable-next-line unicorn/no-null -- testing guard against null meta
		expect(isImageMetadataObject({ meta: null })).toBe(false)
		expect(isImageMetadataObject({ meta: { notSrc: true } })).toBe(false)
	})
})

describe('isDarkLightImageMetadata', () => {
	it('accepts valid dark/light pairs', () => {
		expect(
			isDarkLightImageMetadata({
				dark: validMetadata,
				light: validMetadata,
			}),
		).toBe(true)
	})

	it('rejects if dark is missing', () => {
		expect(isDarkLightImageMetadata({ light: validMetadata })).toBe(false)
	})

	it('rejects if light is missing', () => {
		expect(isDarkLightImageMetadata({ dark: validMetadata })).toBe(false)
	})

	it('rejects null and undefined', () => {
		// eslint-disable-next-line unicorn/no-null -- testing guard against null input
		expect(isDarkLightImageMetadata(null)).toBe(false)
		// eslint-disable-next-line unicorn/no-useless-undefined -- testing explicit undefined input
		expect(isDarkLightImageMetadata(undefined)).toBe(false)
	})

	it('rejects if dark/light are not valid ImageMetadata', () => {
		expect(isDarkLightImageMetadata({ dark: 'not-metadata', light: validMetadata })).toBe(false)
		expect(isDarkLightImageMetadata({ dark: validMetadata, light: 42 })).toBe(false)
	})
})
