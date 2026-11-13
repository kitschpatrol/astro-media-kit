import { describe, expect, expectTypeOf, it } from 'vitest'
import type { AphexConfig, TldrawConfig } from '../src/index'
import { requireOptionalVitePlugin } from '../src/integration/optional-peer'

describe('requireOptionalVitePlugin', () => {
	it('loads the Vite plugin of an installed peer', () => {
		const { default: plugin } = requireOptionalVitePlugin(
			'@kitschpatrol/unplugin-tldraw',
			'tldraw',
		) as { default: unknown }
		expect(plugin).toBeTypeOf('function')
	})

	it('names a missing peer and the option that needs it', () => {
		expect(() => requireOptionalVitePlugin('@kitschpatrol/unplugin-missing', 'missing')).toThrow(
			'The mediaKit() "missing" option needs @kitschpatrol/unplugin-missing, which is not installed.',
		)
	})

	it('passes through other errors resolving an installed package', () => {
		// An installed package that does not export `./vite`
		expect(() => requireOptionalVitePlugin('mrmime', 'mrmime')).toThrow(
			expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
		)
	})
})

describe('optional peer option types', () => {
	it('come from the installed plugins instead of falling back to any', () => {
		expectTypeOf<TldrawConfig['cacheDirectory']>().not.toBeAny()
		expectTypeOf<AphexConfig['cacheMode']>().not.toBeAny()
		expectTypeOf<AphexConfig>().not.toHaveProperty('returnMetadata')
	})
})
