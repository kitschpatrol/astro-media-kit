import type { CheerioAPI } from 'cheerio'
import { build } from 'astro'
import { load } from 'cheerio'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURES_ROOT = fileURLToPath(new URL('../fixtures/', import.meta.url))
const buildCache = new Map<string, Promise<string>>()

/**
 * Build an Astro fixture once per process and return a small accessor for
 * reading its generated HTML. Subsequent calls with the same fixture and output
 * directory reuse the build — keeps parity tests fast even when many `it()`
 * blocks hit the same fixture. Browser tests use a separate output so unit
 * builds cannot remove the files being served.
 */
export async function buildFixture(
	fixtureName: string,
	outputDirectory = 'dist',
): Promise<{
	dist: string
	readHTML: (pagePath: string) => Promise<CheerioAPI>
}> {
	const root = path.join(FIXTURES_ROOT, fixtureName)
	const output = path.join(root, outputDirectory)
	let buildPromise = buildCache.get(output)
	if (!buildPromise) {
		buildPromise = (async () => {
			await build({ logLevel: 'silent', outDir: output, root })
			return output
		})()
		buildCache.set(output, buildPromise)
	}

	const distribution = await buildPromise

	return {
		dist: distribution,
		async readHTML(pagePath: string): Promise<CheerioAPI> {
			const relative = pagePath.replaceAll(/^\/|\/$/gv, '')
			const file = path.join(distribution, relative === '' ? '.' : relative, 'index.html')
			const html = await readFile(file, 'utf8')
			return load(html)
		},
	}
}
