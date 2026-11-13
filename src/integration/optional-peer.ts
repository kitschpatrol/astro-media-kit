import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Loads the Vite plugin of an optional peer dependency that a `mediaKit()`
 * option needs. Astro loads the config through a Vite module runner that it
 * closes before running the integration's hooks, so the plugin is loaded with
 * Node's `require` rather than a dynamic `import()`, which the runner would
 * handle.
 *
 * @param packageName - The optional peer, which must export `./vite`.
 * @param option - The `mediaKit()` option that needs it, for the error message.
 *
 * @returns The plugin module.
 * @throws {Error} When the package is not installed, naming it and the option.
 */
export function requireOptionalVitePlugin(packageName: string, option: string): unknown {
	const specifier = `${packageName}/vite`
	let path: string
	try {
		path = require.resolve(specifier)
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'MODULE_NOT_FOUND') {
			throw new Error(
				`The mediaKit() "${option}" option needs ${packageName}, which is not installed. Add it to your project's dependencies, for example with \`pnpm add ${packageName}\`.`,
				{ cause: error },
			)
		}

		throw error
	}

	return require(path)
}
