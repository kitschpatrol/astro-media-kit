import type { CheerioAPI } from 'cheerio'
import { expect } from 'vitest'

/**
 * Attributes ignored by the diff helpers — applied to both the media-kit and
 * Astro sides. If you intentionally add another marker, document it here with a
 * pointer to the source.
 */
const ALLOWLISTED_ATTRS = new Set([
	// Astro's built-in <Image> and our <Image> both stamp this on the emitted
	// <img>. Astro adds it unconditionally; src/components/Image.astro adds it
	// in DEV only. Drop it from both sides so the diff isn't sensitive to that
	// asymmetry.
	'data-image-component',
	// Test-fixture selector. Each parity fixture page renders the media-kit
	// component with `id="local"` and Astro's built-in with `id="astro"` so the
	// diff test can locate each; the values are tooling, not behavior.
	'id',
])

/**
 * Class names media-kit adds via `class:list` on every emitted `<img>`.
 * Stripped from the media-kit side before comparing the `class` attribute.
 */
const ALLOWLISTED_CLASSES = new Set([
	// Public marker class added by src/components/Image.astro and
	// src/components/Picture.astro — `class:list={[..., 'amk']}` on every
	// emitted <img>, intended as a hook for downstream CSS.
	'amk',
])

type AttributeMap = Record<string, string>

function normalize(map: AttributeMap, stripClasses: boolean): AttributeMap {
	const next: AttributeMap = {}
	for (const [key, value] of Object.entries(map)) {
		if (ALLOWLISTED_ATTRS.has(key)) {
			continue
		}

		if (key === 'class' && stripClasses) {
			const remaining = value
				.split(/\s+/)
				.filter((c) => c.length > 0 && !ALLOWLISTED_CLASSES.has(c))
			if (remaining.length > 0) {
				next.class = remaining.join(' ')
			}

			continue
		}

		next[key] = value
	}

	return next
}

function diffAttributes(label: string, mediaKit: AttributeMap, astro: AttributeMap): void {
	const keys = new Set([...Object.keys(mediaKit), ...Object.keys(astro)])
	const mismatches: string[] = []
	for (const key of [...keys].toSorted()) {
		const a = mediaKit[key]
		const b = astro[key]
		if (a !== b) {
			mismatches.push(
				`  ${key}:\n    media-kit: ${JSON.stringify(a)}\n    astro:     ${JSON.stringify(b)}`,
			)
		}
	}

	if (mismatches.length > 0) {
		throw new Error(`${label} attribute diff:\n${mismatches.join('\n')}`)
	}
}

/**
 * Assert that the media-kit `<img>` (located by `mediaKitSelector`) and the
 * Astro built-in `<img>` (`astroSelector`) emit byte-identical attributes,
 * ignoring media-kit's documented additions (see `ALLOWLISTED_ATTRS` /
 * `ALLOWLISTED_CLASSES`).
 */
export function compareImg($: CheerioAPI, mediaKitSelector: string, astroSelector: string): void {
	const mediaKit = $(mediaKitSelector)
	const astro = $(astroSelector)
	expect(mediaKit.length, `media-kit <img> not found for selector "${mediaKitSelector}"`).toBe(1)
	expect(astro.length, `astro <img> not found for selector "${astroSelector}"`).toBe(1)
	diffAttributes(
		'<img>',
		normalize(mediaKit.attr() ?? {}, true),
		normalize(astro.attr() ?? {}, false),
	)
}

/**
 * Assert that the media-kit `<picture>` and the Astro built-in `<picture>`
 * (located by the respective selectors) emit the same structure: same number of
 * `<source>` children in the same order with the same attributes, followed by
 * an `<img>` whose attributes also match (modulo the allowlist).
 */
export function comparePicture(
	$: CheerioAPI,
	mediaKitSelector: string,
	astroSelector: string,
): void {
	const mediaKit = $(mediaKitSelector)
	const astro = $(astroSelector)
	expect(mediaKit.length, `media-kit <picture> not found for selector "${mediaKitSelector}"`).toBe(
		1,
	)
	expect(astro.length, `astro <picture> not found for selector "${astroSelector}"`).toBe(1)

	diffAttributes(
		'<picture>',
		normalize(mediaKit.attr() ?? {}, true),
		normalize(astro.attr() ?? {}, false),
	)

	const mediaKitSources = mediaKit.find('source')
	const astroSources = astro.find('source')
	expect(
		mediaKitSources.length,
		`<source> count mismatch: media-kit=${mediaKitSources.length} astro=${astroSources.length}`,
	).toBe(astroSources.length)

	for (const [index, mediaKitSource] of mediaKitSources.toArray().entries()) {
		const astroSource = astroSources[index]
		diffAttributes(
			`<source>[${index}]`,
			normalize($(mediaKitSource).attr() ?? {}, true),
			normalize($(astroSource).attr() ?? {}, false),
		)
	}

	compareImg($, `${mediaKitSelector} img`, `${astroSelector} img`)
}
