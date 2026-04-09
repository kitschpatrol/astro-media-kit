import { describe, expect, it } from 'vitest'
import {
	getAbsoluteFilePath,
	getFileExtension,
	getPathWithoutExtension,
	resolveAliases,
	stripCwd,
} from '../src/utilities/path'

describe('getFileExtension', () => {
	it('extracts extension from string path', () => {
		expect(getFileExtension('/images/photo.png')).toBe('.png')
		expect(getFileExtension('file.jpg')).toBe('.jpg')
	})

	it('extracts extension from URL', () => {
		expect(getFileExtension(new URL('file:///images/photo.png'))).toBe('.png')
	})

	it('extracts extension from object with src', () => {
		expect(getFileExtension({ src: '/images/photo.webp' })).toBe('.webp')
	})

	it('returns empty string for paths without extension', () => {
		expect(getFileExtension('/images/photo')).toBe('')
		expect(getFileExtension('file-without-ext')).toBe('')
	})

	it('handles dotfiles', () => {
		expect(getFileExtension('.gitignore')).toBe('')
		expect(getFileExtension('/path/.env')).toBe('')
	})

	it('throws for object without src', () => {
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- intentionally testing invalid input
		expect(() => getFileExtension({} as { src: string })).toThrow()
	})
})

describe('getPathWithoutExtension', () => {
	it('strips extension from path', () => {
		expect(getPathWithoutExtension('/images/photo.png')).toBe('/images/photo')
	})

	it('handles nested paths', () => {
		expect(getPathWithoutExtension('/a/b/c/file.test.ts')).toBe('/a/b/c/file.test')
	})

	it('returns path unchanged if no extension', () => {
		expect(getPathWithoutExtension('/images/photo')).toBe('/images/photo')
	})
})

describe('stripCwd', () => {
	it('strips cwd prefix', () => {
		const cwd = process.cwd()
		expect(stripCwd(`${cwd}/src/file.ts`)).toBe('/src/file.ts')
	})

	it('leaves non-cwd paths unchanged', () => {
		expect(stripCwd('/other/path/file.ts')).toBe('/other/path/file.ts')
	})

	it('leaves relative paths unchanged', () => {
		expect(stripCwd('./relative/file.ts')).toBe('./relative/file.ts')
	})
})

describe('getAbsoluteFilePath', () => {
	it('resolves relative path against cwd', () => {
		const result = getAbsoluteFilePath('/src/file.ts')
		expect(result).toBe(`${process.cwd()}/src/file.ts`)
	})

	it('adds dist prefix when requested', () => {
		const result = getAbsoluteFilePath('/src/file.ts', true)
		expect(result).toBe(`${process.cwd()}/dist/src/file.ts`)
	})

	it('strips cwd before joining to avoid duplication', () => {
		const cwd = process.cwd()
		const result = getAbsoluteFilePath(`${cwd}/src/file.ts`)
		expect(result).toBe(`${cwd}/src/file.ts`)
	})

	it('strips /@fs/ prefix', () => {
		const result = getAbsoluteFilePath('/@fs/Users/test/project/src/file.ts')
		expect(result).toContain('src/file.ts')
	})
})

describe('resolveAliases', () => {
	it('resolves ~/ to src directory', () => {
		const result = resolveAliases('~/components/Image.astro')
		expect(result).toContain('src/components/Image.astro')
		expect(result).toContain(process.cwd())
	})

	it('leaves non-alias paths unchanged', () => {
		expect(resolveAliases('/absolute/path')).toBe('/absolute/path')
		expect(resolveAliases('./relative/path')).toBe('./relative/path')
		expect(resolveAliases('bare/path')).toBe('bare/path')
	})

	it('only matches ~/ prefix, not bare ~', () => {
		expect(resolveAliases('~notAlias')).toBe('~notAlias')
	})
})
