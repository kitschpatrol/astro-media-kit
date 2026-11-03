import { describe, expect, it } from 'vitest'
import {
	getAbsoluteFilePath,
	getFileExtension,
	getPathWithoutExtension,
	getPublicFilePath,
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

	it('ignores URL query strings and fragments', () => {
		expect(getFileExtension('https://example.com/photo.jpg?width=800#preview')).toBe('.jpg')
		expect(getFileExtension('C:\\images\\photo.jpg?import#preview')).toBe('.jpg')
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
		expect(() => getFileExtension({})).toThrow()
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

// Path utilities normalize to POSIX (forward slashes) for cross-platform
// consistency, so test expectations also use a POSIX-normalized cwd.
const posixCwd = process.cwd().replaceAll('\\', '/')

describe('stripCwd', () => {
	it('strips cwd prefix', () => {
		expect(stripCwd(`${posixCwd}/src/file.ts`)).toBe('/src/file.ts')
	})

	it('leaves non-cwd paths unchanged', () => {
		expect(stripCwd('/other/path/file.ts')).toBe('/other/path/file.ts')
	})

	it('does not strip a sibling directory sharing the cwd prefix', () => {
		const sibling = `${posixCwd}-other/src/file.ts`
		expect(stripCwd(sibling)).toBe(sibling)
	})

	it('leaves relative paths unchanged', () => {
		expect(stripCwd('./relative/file.ts')).toBe('./relative/file.ts')
	})
})

describe('getAbsoluteFilePath', () => {
	it('resolves relative path against cwd', () => {
		const result = getAbsoluteFilePath('/src/file.ts')
		expect(result).toBe(`${posixCwd}/src/file.ts`)
	})

	it('preserves spaces and Unicode in local filenames', () => {
		expect(getAbsoluteFilePath('./src/my photo.jpg')).toBe(`${posixCwd}/src/my photo.jpg`)
		expect(getAbsoluteFilePath('./src/日本.jpg')).toBe(`${posixCwd}/src/日本.jpg`)
	})

	it('decodes file URL paths', () => {
		expect(getAbsoluteFilePath(new URL(`file://${posixCwd}/src/my%20photo.jpg`))).toBe(
			`${posixCwd}/src/my photo.jpg`,
		)
	})

	it('adds dist prefix when requested', () => {
		const result = getAbsoluteFilePath('/src/file.ts', true)
		expect(result).toBe(`${posixCwd}/dist/src/file.ts`)
	})

	it('strips cwd before joining to avoid duplication', () => {
		const result = getAbsoluteFilePath(`${posixCwd}/src/file.ts`)
		expect(result).toBe(`${posixCwd}/src/file.ts`)
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
		expect(result).toContain(posixCwd)
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

describe('getPublicFilePath', () => {
	it('removes URL query strings and media fragments before probing', () => {
		expect(getPublicFilePath('/videos/intro.mp4?v=1#t=2')).toBe(
			`${posixCwd}/public/videos/intro.mp4`,
		)
	})

	it('accepts a literal percent sign in a public filename', () => {
		expect(getPublicFilePath('/videos/100%.mp4')).toBe(`${posixCwd}/public/videos/100%.mp4`)
	})

	it('decodes encoded public filenames', () => {
		expect(getPublicFilePath('/videos/my%20video.mp4')).toBe(
			`${posixCwd}/public/videos/my video.mp4`,
		)
	})
})
