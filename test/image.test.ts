import { describe, expect, it } from 'vitest'
import {
	isDarkLightImageMetadata,
	isImageMetadataObject,
	isRemoteImageSource,
} from '../src/components/utils/image'

const valid = { format: 'png', height: 100, src: '/image.png', width: 200 }

describe('isImageMetadataObject', () => {
	it('accepts valid ImageMetadata objects', () => {
		expect(isImageMetadataObject(valid)).toBe(true)
		expect(isImageMetadataObject({ src: '/test.jpg' })).toBe(true)
	})

	it('accepts SVG component wrappers with .meta', () => {
		// eslint-disable-next-line ts/no-empty-function -- simulates Astro SVG component wrapper
		const svgComponent = Object.assign(() => {}, { meta: valid })
		expect(isImageMetadataObject(svgComponent)).toBe(true)
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
	})

	it('rejects SVG wrappers with invalid meta', () => {
		// eslint-disable-next-line unicorn/no-null -- testing guard against null meta
		for (const meta of ['not-an-object', null, { notSrc: true }]) {
			expect(isImageMetadataObject({ meta })).toBe(false)
		}
	})
})

describe('isRemoteImageSource', () => {
	it('accepts http and https URL strings', () => {
		expect(isRemoteImageSource('https://example.com/image.jpg')).toBe(true)
		expect(isRemoteImageSource('http://example.com/image.jpg')).toBe(true)
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

describe('isDarkLightImageMetadata', () => {
	it('accepts valid dark/light pairs', () => {
		expect(isDarkLightImageMetadata({ dark: valid, light: valid })).toBe(true)
	})

	it('rejects missing or invalid members', () => {
		/* eslint-disable unicorn/no-null, unicorn/no-useless-undefined */
		expect(isDarkLightImageMetadata({ light: valid })).toBe(false)
		expect(isDarkLightImageMetadata({ dark: valid })).toBe(false)
		expect(isDarkLightImageMetadata(null)).toBe(false)
		expect(isDarkLightImageMetadata(undefined)).toBe(false)
		expect(isDarkLightImageMetadata({ dark: 'not-metadata', light: valid })).toBe(false)
		expect(isDarkLightImageMetadata({ dark: valid, light: 42 })).toBe(false)
		/* eslint-enable unicorn/no-null, unicorn/no-useless-undefined */
	})
})
