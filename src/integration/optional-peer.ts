/**
 * Imports the Vite plugin of an optional peer dependency that a `mediaKit()`
 * option needs.
 *
 * Call it at module scope. Astro loads the config through a Vite module runner
 * that it closes before running the integration's hooks, so an `import()` from
 * a hook fails. At module scope it runs while the config loads, as a static
 * import would, but a missing peer doesn't stop the import of this package.
 *
 * Whether the peer is installed is checked with `import.meta.resolve`, which
 * uses Node's resolver. An `import()` of a missing peer fails differently in
 * each module runner, and Vite stands in a placeholder module for one declared
 * as an optional peer.
 *
 * @param packageName - The optional peer, which must export `./vite`.
 * @param option - The `mediaKit()` option that needs it, for the error message.
 *
 * @returns A function that returns the plugin's default export.
 * @throws {Error} When the peer is installed but fails to resolve or load.
 */
export async function importOptionalVitePlugin(
	packageName: string,
	option: string,
): Promise<() => unknown> {
	const specifier = `${packageName}/vite`
	try {
		import.meta.resolve(specifier)
	} catch (error) {
		if (!(error instanceof Error) || !('code' in error) || error.code !== 'ERR_MODULE_NOT_FOUND') {
			throw error
		}

		return () => {
			throw new Error(
				`The mediaKit() "${option}" option needs ${packageName}, which is not installed. Add it to your project's dependencies, for example with \`pnpm add ${packageName}\`.`,
				{ cause: error },
			)
		}
	}

	// The specifier isn't a literal, so TypeScript doesn't resolve it where the peer isn't installed
	const module = (await import(/* @vite-ignore */ specifier)) as { default: unknown }
	return () => module.default
}
