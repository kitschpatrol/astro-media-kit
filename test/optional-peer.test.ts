import { build } from 'astro'
import { cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import type { AphexConfig, MediaKitConfig, TldrawConfig } from '../src/index'
import manifest from '../package.json' with { type: 'json' }
import { importOptionalVitePlugin } from '../src/integration/optional-peer'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * Creates an Astro project with this package installed as it is from the
 * registry: a copy of its published files beside its dependencies, and only the
 * given optional peers. It has to be outside the repository, where the optional
 * peers would resolve from the repository's own `node_modules`.
 */
async function createConsumer(parent: string, optionalPeers: string[]): Promise<string> {
	const root = await mkdtemp(path.join(parent, 'consumer-'))
	const nodeModules = path.join(root, 'node_modules')

	const installed = path.join(nodeModules, manifest.name)
	await mkdir(installed, { recursive: true })
	for (const published of ['package.json', ...manifest.files]) {
		await cp(path.join(repositoryRoot, published), path.join(installed, published), {
			recursive: true,
		})
	}

	for (const name of [...Object.keys(manifest.dependencies), 'astro', ...optionalPeers]) {
		const link = path.join(nodeModules, name)
		await mkdir(path.dirname(link), { recursive: true })
		// A junction needs no privileges on Windows, and is a plain link elsewhere
		await symlink(await realpath(path.join(repositoryRoot, 'node_modules', name)), link, 'junction')
	}

	await mkdir(path.join(root, 'src', 'pages'), { recursive: true })
	await writeFile(path.join(root, 'src', 'pages', 'index.astro'), '<h1>Consumer</h1>\n')
	return root
}

/** Builds a consumer project, which loads its config as the Astro CLI does. */
async function buildConsumer(root: string, config: MediaKitConfig): Promise<void> {
	await writeFile(
		path.join(root, 'astro.config.ts'),
		[
			`import { defineConfig } from 'astro/config'`,
			`import mediaKit from '${manifest.name}'`,
			`export default defineConfig({ integrations: [mediaKit(${JSON.stringify(config)})] })`,
			'',
		].join('\n'),
	)
	await build({ logLevel: 'silent', root })
}

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

	it('passes through other errors resolving an installed package', async () => {
		// An installed package that does not export `./vite`
		await expect(importOptionalVitePlugin('mrmime', 'mrmime')).rejects.toThrow(
			expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
		)
	})
})

describe('mediaKit() in a project without its optional peers', () => {
	let temporaryDirectory: string
	let withoutPeers: string
	let withTldraw: string

	beforeAll(async () => {
		// Resolved, so that Vite sees the paths Node does where the temporary
		// directory is a link or a Windows short path
		temporaryDirectory = await realpath(await mkdtemp(path.join(tmpdir(), 'astro-media-kit-peer-')))
		withoutPeers = await createConsumer(temporaryDirectory, [])
		withTldraw = await createConsumer(temporaryDirectory, ['@kitschpatrol/unplugin-tldraw'])
	})

	afterAll(async () => {
		await rm(temporaryDirectory, { force: true, recursive: true })
	})

	it('builds while the options that need them are off', async () => {
		await expect(buildConsumer(withoutPeers, {})).resolves.toBeUndefined()
	})

	it.each(['aphex', 'tldraw'] as const)(
		'names the missing peer when the %s option is on',
		async (option) => {
			await expect(buildConsumer(withoutPeers, { [option]: true })).rejects.toThrow(
				`The mediaKit() "${option}" option needs @kitschpatrol/unplugin-${option}, which is not installed.`,
			)
		},
	)

	it('builds with the one peer that is installed', async () => {
		await expect(buildConsumer(withTldraw, { tldraw: true })).resolves.toBeUndefined()
	})

	it('names the missing peer beside an installed one', async () => {
		await expect(buildConsumer(withTldraw, { aphex: true, tldraw: true })).rejects.toThrow(
			'The mediaKit() "aphex" option needs @kitschpatrol/unplugin-aphex, which is not installed.',
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
