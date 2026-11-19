import { describe, expect, expectTypeOf, it } from 'vitest'
import type { AphexConfig, TldrawConfig } from '../src/index'
import { importOptionalVitePlugin } from '../src/integration/optional-peer'

describe('importOptionalVitePlugin', () => {
	it('loads the Vite plugin of an installed peer', async () => {
		const getPlugin = await importOptionalVitePlugin('@kitschpatrol/unplugin-tldraw', 'tldraw')
		expect(getPlugin()).toBeTypeOf('function')
	})

	it('defers the error for a missing peer until its plugin is needed', async () => {
		const getPlugin = await importOptionalVitePlugin('@kitschpatrol/unplugin-missing', 'missing')
		expect(() => getPlugin()).toThrow(
			'The mediaKit() "missing" option needs @kitschpatrol/unplugin-missing, which is not installed.',
		)
	})

	it('passes through other errors importing an installed package', async () => {
		// An installed package that does not export `./vite`. The error's shape
		// depends on the module runner, so only check that it names the package.
		await expect(importOptionalVitePlugin('mrmime', 'mrmime')).rejects.toThrow('mrmime')
	})
})

describe('optional peer option types', () => {
	it('come from the installed plugins instead of falling back to any', () => {
		expectTypeOf<TldrawConfig['cacheDirectory']>().not.toBeAny()
		expectTypeOf<AphexConfig['cacheMode']>().not.toBeAny()
		expectTypeOf<AphexConfig>().not.toHaveProperty('returnMetadata')
	})
})
