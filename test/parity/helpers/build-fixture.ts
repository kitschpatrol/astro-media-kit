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
 * reading its generated HTML. Subsequent calls with the same `fixtureName`
 * reuse the same build — keeps parity tests fast even when many `it()` blocks
 * hit the same fixture.
 */
export async function buildFixture(fixtureName: string): Promise<{
	dist: string
	readHTML: (pagePath: string) => Promise<CheerioAPI>
}> {
	const root = path.join(FIXTURES_ROOT, fixtureName)
	let buildPromise = buildCache.get(fixtureName)
	if (!buildPromise) {
		buildPromise = (async () => {
			await build({ logLevel: 'silent', root })
			return path.join(root, 'dist')
		})()
		buildCache.set(fixtureName, buildPromise)
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
