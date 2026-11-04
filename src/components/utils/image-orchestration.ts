/**
 * Shared orchestration helpers for the `<Image>` and `<Picture>` components.
 *
 * Both components resolve a user-supplied source (ImageMetadata / DarkLight
 * pair / string path) into optimized image variants via Astro's `getImage()`.
 * This module consolidates the non-template pieces of that pipeline: src
 * resolution, layout defaults, background compositing, transparency-aware
 * fallback-format selection, srcset/mime building, and dev-only warnings.
 */

import type { ImageInputFormat, ImageMetadata, ImageOutputFormat } from 'astro'
import type { getImage, imageConfig } from 'astro:assets'
import type { HTMLAttributes } from 'astro/types'
import * as mime from 'mrmime'
import type { DarkLightImageMetadata, ImageMetadataLike } from '../../types'
import type { Simplify } from './types'
import { opaqueFormats } from '../../utilities/dark-variant'
import {
	isDarkLightImageMetadata,
	isImageMetadataObject,
	isImageUrlSource,
	resolveImageSource,
	unwrapImageMetadata,
} from './image'

/**
 * Result type returned by Astro's `getImage()` — not directly importable from
 * `astro:assets`.
 */
export type GetImageResult = Awaited<ReturnType<typeof getImage>>

/** Astro's runtime image config object (as exported from `astro:assets`). */
export type ImageConfig = typeof imageConfig

/**
 * Key for `DEFAULT_FALLBACK_RULES` / `DEFAULT_FORMATS_RULES` and the object
 * forms of `<Picture>`'s `fallbackFormat` and `formats` props. Covers every
 * `ImageInputFormat` plus `'unknown'` for sources whose format can't be
 * inferred (raw string paths, remote URLs).
 *
 * `apng` (Astro ≥ 7.2.5) is importable only for use with plain `<img>` —
 * Astro's image service rejects it to avoid stripping animation, so its rule
 * entries exist for key-completeness and never reach a transform.
 */
export type FallbackKey = 'unknown' | ImageInputFormat

/**
 * Per-input-format single-output overrides used by props that resolve to one
 * output format per source: `<Image>`'s `format` and `<Picture>`'s
 * `fallbackFormat`. Keyed by `ImageInputFormat`, plus `'unknown'` for remote
 * URLs and raw string sources whose format can't be probed at build time.
 * Merged on top of a defaults table (`DEFAULT_IMAGE_OUTPUT_FORMAT_RULES` or
 * `DEFAULT_FALLBACK_RULES`), so passing `{ webp: 'webp' }` overrides one entry
 * without restating the rest.
 */
export type FormatRules = Simplify<Partial<Record<FallbackKey, ImageOutputFormat>>>

/**
 * Per-input-format `<source>` output overrides for `<Picture>`'s `formats`
 * prop. Same key set as `FormatRules`. Each value is a list of output formats;
 * one `<source>` element is emitted per entry, in order. Merged on top of
 * `DEFAULT_FORMATS_RULES`, so passing `formats={{ svg: ['svg'] }}` overrides
 * one entry while every other input format keeps its default rule. An empty
 * array (`{ svg: [] }`) emits zero preferred `<source>` elements for that
 * input. The `<img>` carries the light fallback; a dark fallback `<source>` is
 * still emitted when needed to preserve theme switching.
 */
export type FormatsRules = Simplify<Partial<Record<FallbackKey, ImageOutputFormat[]>>>

/**
 * Per-input-format `<img>` fallback format used by `<Picture>` when
 * `fallbackFormat` isn't a single forced output format. Matches Astro's
 * documented defaults exactly: `gif → gif`, `svg → svg`, `jpg → jpg`, `jpeg →
 * jpeg`, everything else (and `'unknown'` for remote sources) → `png`.
 * Consumers override per instance by passing a `FormatRules` object to
 * `fallbackFormat`; supplied entries are merged on top of these defaults.
 *
 * SVG maps to itself because sharp refuses to rasterize SVGs without
 * `image.dangerouslyProcessSVG`. A caller who explicitly overrides
 * `fallbackFormat={{ svg: 'webp' }}` is responsible for enabling that config.
 */
export const DEFAULT_FALLBACK_RULES: Record<FallbackKey, ImageOutputFormat> = {
	apng: 'png',
	avif: 'png',
	gif: 'gif',
	jpeg: 'jpeg',
	jpg: 'jpg',
	png: 'png',
	svg: 'svg',
	tiff: 'png',
	unknown: 'png',
	webp: 'png',
}

/**
 * Per-input-format output format used by `<Image>` when `format` isn't a single
 * forced output format. Matches Astro's `baseService.validateOptions` default
 * exactly (`DEFAULT_OUTPUT_FORMAT = 'webp'` from `astro/src/assets/consts.ts`,
 * with the SVG exception in `resolveDefaultOutputFormat`): SVG stays SVG,
 * everything else (and `'unknown'` for remote/string sources) becomes WebP.
 * Consumers override per instance by passing a `FormatRules` object to
 * `format`; supplied entries are merged on top of these defaults.
 */
export const DEFAULT_IMAGE_OUTPUT_FORMAT_RULES: Record<FallbackKey, ImageOutputFormat> = {
	apng: 'webp',
	avif: 'webp',
	gif: 'webp',
	jpeg: 'webp',
	jpg: 'webp',
	png: 'webp',
	svg: 'svg',
	tiff: 'webp',
	unknown: 'webp',
	webp: 'webp',
}

/**
 * Per-input-format `<source>` output formats used by `<Picture>` when `formats`
 * isn't a forced list. Matches Astro's built-in default exactly — `['webp']`
 * for every input — so default rendering is byte-for-byte identical to Astro's
 * `<Picture>`. Consumers override per instance by passing a `FormatsRules`
 * object to `formats`; supplied entries are merged on top of these defaults.
 *
 * SVG defaults to `['webp']` to preserve Astro parity, but Sharp refuses to
 * rasterize SVGs without `image.dangerouslyProcessSVG`. Pass `formats={{ svg:
 * ['svg'] }}` (per call site or as a wrapper default) to preserve SVGs as
 * vectors.
 */
export const DEFAULT_FORMATS_RULES: Record<FallbackKey, ImageOutputFormat[]> = {
	apng: ['webp'],
	avif: ['webp'],
	gif: ['webp'],
	jpeg: ['webp'],
	jpg: ['webp'],
	png: ['webp'],
	svg: ['webp'],
	tiff: ['webp'],
	unknown: ['webp'],
	webp: ['webp'],
}

/**
 * Narrow a `src` value to an ESM-imported `ImageMetadata`. Mirrors the check
 * used inside Astro's own `<Picture>` — SVG component functions count as
 * "imported" because they carry a `src` property.
 */
export function isESMImportedImage(src: ImageMetadata | string): src is ImageMetadata {
	return typeof src === 'object' || (typeof src === 'function' && 'src' in src)
}

/**
 * Resolve a possibly-Promise ESM default export down to its `ImageMetadata` or
 * string form. Kept small so it can be used interchangeably with plain values.
 */
export async function resolveSrc<
	T extends DarkLightImageMetadata | ImageMetadata | ImageMetadataLike | string,
>(src: Promise<{ default: T }> | T): Promise<T> {
	if (typeof src === 'object' && 'then' in src) {
		const resolved = await src
		return resolved.default
	}

	return src
}

/**
 * Throw a descriptive error when a consumer passes a relative string path.
 * Relative paths only resolve through the `mediaKit()` integration's
 * auto-import transform; a raw relative string here means either the
 * integration isn't registered or the user meant to import the asset as an ES
 * module.
 */
export function assertNotRelativePath(path: unknown, componentName: string): void {
	if (typeof path === 'string' && (path.startsWith('./') || path.startsWith('../'))) {
		throw new Error(
			`${componentName} received a relative string path "${path}". ` +
				'Add the mediaKit() integration to your astro.config to enable auto-importing, ' +
				'or import the image and pass the ImageMetadata object directly.',
		)
	}
}

/**
 * Resolve a user-supplied `src` (and optional `srcDark` override) down to
 * concrete `ImageMetadata`. Handles the three input shapes both components
 * accept: `{ dark, light }` pairs, ESM-imported `ImageMetadata` objects, and
 * absolute string paths.
 */
export async function resolveSrcToMetadata(
	src: DarkLightImageMetadata | ImageMetadata | ImageMetadataLike | string,
	srcDarkSource: ImageMetadata | ImageMetadataLike | string | undefined,
	options: { componentName: string; darkDisabled: boolean },
): Promise<{ imageMetadata: ImageMetadata; imageMetadataDark: ImageMetadata | undefined }> {
	assertNotRelativePath(src, options.componentName)
	assertNotRelativePath(srcDarkSource, options.componentName)
	if (typeof srcDarkSource === 'string' && isImageUrlSource(srcDarkSource)) {
		throw new Error(
			`${options.componentName} received a URL for \`srcDark\` ("${srcDarkSource}") with a local \`src\`. ` +
				'A dark variant must match its light source: pass two local images, or two URLs.',
		)
	}

	let imageMetadata: ImageMetadata
	let imageMetadataDark: ImageMetadata | undefined

	if (isDarkLightImageMetadata(src)) {
		imageMetadata = unwrapImageMetadata(src.light)
		if (srcDarkSource !== undefined && srcDarkSource !== '') {
			imageMetadataDark = isImageMetadataObject(srcDarkSource)
				? unwrapImageMetadata(srcDarkSource)
				: ((await resolveImageSource(srcDarkSource)) as ImageMetadata)
		} else if (!options.darkDisabled) {
			imageMetadataDark = unwrapImageMetadata(src.dark)
		}
	} else if (isImageMetadataObject(src)) {
		imageMetadata = unwrapImageMetadata(src)
		if (srcDarkSource !== undefined && srcDarkSource !== '') {
			imageMetadataDark = isImageMetadataObject(srcDarkSource)
				? unwrapImageMetadata(srcDarkSource)
				: ((await resolveImageSource(srcDarkSource)) as ImageMetadata)
		}
	} else {
		const resolved =
			srcDarkSource === undefined || srcDarkSource === ''
				? await resolveImageSource(src)
				: await resolveImageSource(src, srcDarkSource)

		if (isDarkLightImageMetadata(resolved)) {
			imageMetadata = resolved.light
			imageMetadataDark = options.darkDisabled ? undefined : resolved.dark
		} else {
			imageMetadata = resolved
		}
	}

	return { imageMetadata, imageMetadataDark }
}

/**
 * Props relevant to layout merging. Kept permissive so both components can pass
 * through.
 */
export type LayoutMergeProps = {
	fit?: string | undefined
	layout?: 'constrained' | 'fixed' | 'full-width' | 'none' | undefined
	position?: string | undefined
}

/**
 * Merge `imageConfig` layout defaults into a copy of the caller's getImage
 * props, matching Astro's `<Picture>` behavior: when a layout is active,
 * default `fit`/`position`; otherwise still surface
 * `objectFit`/`objectPosition` if set globally.
 */
export function mergeLayoutDefaults<T extends LayoutMergeProps>(
	imageProps: T,
	config: ImageConfig,
): { layout: NonNullable<LayoutMergeProps['layout']>; merged: T; useResponsive: boolean } {
	const layout = imageProps.layout ?? config.layout ?? 'none'
	const useResponsive = layout !== 'none'
	const merged: T = { ...imageProps }

	if (useResponsive) {
		merged.layout ??= config.layout
		merged.fit ??= config.objectFit ?? 'cover'
		merged.position ??= config.objectPosition ?? 'center'
	} else {
		const configuredFitOrPosition = config.objectFit ?? config.objectPosition
		if (configuredFitOrPosition !== undefined && configuredFitOrPosition !== '') {
			merged.fit ??= config.objectFit
			merged.position ??= config.objectPosition
		}
	}

	return { layout, merged, useResponsive }
}

/**
 * Preserve Astro's background compositing. When a dark background is also
 * requested, keep transparent formats transparent so CSS can switch colors;
 * opaque JPEG output still needs its background composited into the pixels.
 */
export function compositingBackground(
	format: string | undefined,
	background?: string,
	backgroundDark?: string,
): Record<string, string> {
	return background !== undefined &&
		background !== '' &&
		(backgroundDark === undefined || opaqueFormats.has(format!))
		? { background }
		: {}
}

/** Preserve the caller's inline styling and append the kit's background styles. */
export function mergeImageStyle(
	style: HTMLAttributes<'img'>['style'],
	backgroundStyle: string | undefined,
): HTMLAttributes<'img'>['style'] {
	if (backgroundStyle === undefined) {
		return style
	}

	if (typeof style === 'string') {
		return `${style};${backgroundStyle}`
	}

	const backgroundProperties = Object.fromEntries(
		backgroundStyle.split(';').map((declaration) => {
			const colon = declaration.indexOf(':')
			return [declaration.slice(0, colon), declaration.slice(colon + 1)]
		}),
	)
	return { ...style, ...backgroundProperties }
}

/**
 * Pick the `<img>` fallback format. Handles all three shapes accepted by
 * `<Picture>`'s `fallbackFormat` prop:
 *
 * - `string` (`ImageOutputFormat`) — forces that format for every source,
 *   matching Astro's built-in `fallbackFormat` semantics.
 * - `FormatRules` object — merged on top of `DEFAULT_FALLBACK_RULES`, then looked
 *   up by the source's input format (or `'unknown'` for raw strings / remote
 *   URLs).
 * - `undefined` — same as passing an empty object: falls through to
 *   `DEFAULT_FALLBACK_RULES`, which mirrors Astro's per-format behavior.
 */
export function pickFallbackFormat(
	fallbackFormat: FormatRules | ImageOutputFormat | undefined,
	resolvedSrc: ImageMetadata | string,
): ImageOutputFormat {
	if (typeof fallbackFormat === 'string') {
		return fallbackFormat
	}

	const rules = { ...DEFAULT_FALLBACK_RULES, ...fallbackFormat }
	return rules[isESMImportedImage(resolvedSrc) ? resolvedSrc.format : 'unknown']
}

/**
 * Pick the `<Image>` output format. Handles all three shapes accepted by
 * `<Image>`'s `format` prop:
 *
 * - `string` (`ImageOutputFormat`) — forces that format for every source,
 *   matching Astro's built-in `format` semantics (the value is forwarded to the
 *   image service as-is).
 * - `FormatRules` object — merged on top of `DEFAULT_IMAGE_OUTPUT_FORMAT_RULES`,
 *   then looked up by the source's input format (or `'unknown'` for raw strings
 *   / remote URLs).
 * - `undefined` — falls through to `DEFAULT_IMAGE_OUTPUT_FORMAT_RULES`, which
 *   mirrors Astro's `baseService` default (SVG → SVG, everything else → WebP).
 */
export function pickImageFormat(
	format: FormatRules | ImageOutputFormat | undefined,
	resolvedSrc: ImageMetadata | string,
): ImageOutputFormat {
	if (typeof format === 'string') {
		return format
	}

	const rules = { ...DEFAULT_IMAGE_OUTPUT_FORMAT_RULES, ...format }
	return rules[isESMImportedImage(resolvedSrc) ? resolvedSrc.format : 'unknown']
}

/**
 * Pick the `<source>` output formats list. Handles all three shapes accepted by
 * `<Picture>`'s `formats` prop:
 *
 * - `ImageOutputFormat[]` — forces that list for every source, matching Astro's
 *   built-in `formats` semantics.
 * - `FormatsRules` object — merged on top of `DEFAULT_FORMATS_RULES`, then looked
 *   up by the source's input format (or `'unknown'` for raw strings / remote
 *   URLs).
 * - `undefined` — same as passing an empty object: falls through to
 *   `DEFAULT_FORMATS_RULES`, which mirrors Astro's `['webp']` default for every
 *   input.
 */
export function pickFormats(
	formats: FormatsRules | ImageOutputFormat[] | undefined,
	resolvedSrc: ImageMetadata | string,
): ImageOutputFormat[] {
	if (Array.isArray(formats)) {
		return formats
	}

	const rules = { ...DEFAULT_FORMATS_RULES, ...formats }
	return rules[isESMImportedImage(resolvedSrc) ? resolvedSrc.format : 'unknown']
}

/**
 * A short, stable hash of a selector, for a class that scopes its rules: the
 * same selector gives the same class in every build.
 */
export async function hashSelector(selector: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(selector))
	return Array.from(new Uint8Array(digest, 0, 6), (byte) =>
		byte.toString(16).padStart(2, '0'),
	).join('')
}

const SCOPED_STYLE_CLASS_REGEX = /\bastro-\w{8}\b/v

/**
 * Extract Astro's auto-generated scoped-style class (e.g. `astro-ab12cd34`)
 * from a className string.
 */
export function extractScopedStyleClass(className?: string): string | undefined {
	return className?.match(SCOPED_STYLE_CLASS_REGEX)?.[0]
}

/**
 * Forward any `data-astro-cid-*` island attributes from the source prop bag
 * onto the target attribute bag (mutates `to`). Needed because Astro injects
 * those attributes onto rendered components, but the `<picture>` wrapper we
 * emit isn't one of them.
 */
export function propagateAstroCidAttributes(
	from: Readonly<Record<string, unknown>>,
	to: Record<string, unknown>,
): void {
	for (const [key, value] of Object.entries(from)) {
		if (key.startsWith('data-astro-cid')) {
			to[key] = value
		}
	}
}

/**
 * Build the `background-color` CSS style strings for the light and dark
 * variants of an image. `isSelector` mode emits plain `background-color` for
 * each image (each lives in its own `<picture>` toggled by CSS); `media` mode
 * uses `light-dark()` when both colors are set so a single `<img>` can respond
 * to `prefers-color-scheme`.
 */
export function buildBackgroundStyle(options: {
	background: string | undefined
	backgroundDark: string | undefined
	isSelector: boolean
}): { dark: string | undefined; light: string | undefined } {
	const { background, backgroundDark, isSelector } = options
	if (isSelector) {
		const light =
			background === undefined || background === '' ? undefined : `background-color:${background}`
		const darkBg = backgroundDark ?? background
		const dark = darkBg === undefined || darkBg === '' ? undefined : `background-color:${darkBg}`
		return { dark, light }
	}

	let light: string | undefined
	if (
		background !== undefined &&
		background !== '' &&
		backgroundDark !== undefined &&
		backgroundDark !== ''
	) {
		light = `color-scheme:light dark;background-color:light-dark(${background},${backgroundDark})`
	} else if (backgroundDark !== undefined && backgroundDark !== '') {
		light = `color-scheme:light dark;background-color:light-dark(transparent,${backgroundDark})`
	} else if (background !== undefined && background !== '') {
		light = `background-color:${background}`
	}

	return { dark: undefined, light }
}

/** Props relevant to srcset building. Shared shape for both components. */
export type SrcsetBuildProps = {
	densities?: readonly unknown[] | undefined
	widths?: readonly number[] | undefined
}

/**
 * Build the srcset attribute value for a `<source>` or `<img>` from a
 * `GetImageResult`. Density-descriptor srcset prepend the base `src` (Astro's
 * `.srcSet.attribute` only carries the variants); width-descriptor srcset use
 * `.srcSet.attribute` directly. Without variants, the base URL remains a valid
 * source candidate, including SVGs passed through unchanged in a static build.
 */
export function buildSrcsetAttribute(
	image: GetImageResult,
	props: SrcsetBuildProps,
	useResponsive: boolean,
): string {
	if (image.srcSet.values.length === 0) {
		return image.src
	}

	const { densities, widths } = props
	// Astro discards densities when a responsive layout generates width
	// descriptors. A bare URL would add an incompatible implicit 1x candidate
	// there, and a duplicate one beside an explicit 1x density.
	const hasExplicit1x = image.srcSet.values.some((value) => value.descriptor === '1x')
	return !useResponsive && !hasExplicit1x && (densities !== undefined || widths === undefined)
		? `${image.src}, ${image.srcSet.attribute}`
		: image.srcSet.attribute
}

/**
 * Resolve the final `sizes` attribute value. When the user supplied `sizes`,
 * it's passed through unchanged. When Astro auto-generated `sizes` (responsive
 * layout without an explicit user value), the result is prefixed with `"auto,
 * "` so lazy-loaded images can use the browser's auto-sizes behavior. Native
 * SVG output opts out: Safari 27 distorts SVG painting with automatic sizes.
 * https://bugs.webkit.org/show_bug.cgi?id=324661 Returns `undefined` when no
 * sizes value is present.
 */
export function resolveSizesAttribute(
	userSizes: string | undefined,
	sizes: string | undefined,
	allowAuto = true,
): string | undefined {
	if (sizes === undefined) {
		return undefined
	}

	return userSizes === undefined && allowAuto ? `auto, ${sizes}` : sizes
}

/** Resolve the MIME `type` attribute for a `<source>` element. */
export function getMimeType(image: GetImageResult): string {
	return mime.lookup(image.options.format ?? image.src) ?? `image/${String(image.options.format)}`
}

/**
 * Dev-only warning emitted when a caller supplies width descriptors but no
 * `sizes` attribute or responsive layout. Without `sizes`, browsers assume
 * `100vw` and download the largest variant.
 */
export function warnWidthsWithoutSizes(
	imageName: string,
	props: {
		densities?: readonly unknown[] | undefined
		sizes?: string | undefined
		widths?: readonly number[] | undefined
	},
	useResponsive: boolean,
	componentName: string,
): void {
	if (!import.meta.env.DEV || !props.widths || props.widths.length === 0) {
		return
	}

	const hasDensities = props.densities !== undefined && props.densities.length > 0
	const hasSizes = props.sizes !== undefined && props.sizes.length > 0
	if (hasDensities || hasSizes || useResponsive) {
		return
	}

	console.warn(
		`[astro-media-kit] ${componentName} "${imageName}" has \`widths\` but no \`sizes\` or responsive layout. Browser will assume \`sizes="100vw"\` and download a larger image than needed. Pass \`sizes=\` or use \`layout="constrained"\` with \`width=\`.`,
	)
}

/**
 * Dev-only warning when `backgroundDark` is set without `background`. Without a
 * light-mode color, light mode stays transparent and the dark-mode color never
 * composites visibly.
 */
export function warnBackgroundDarkWithoutBackground(
	background: string | undefined,
	backgroundDark: string | undefined,
	componentName: string,
): void {
	if (
		backgroundDark !== undefined &&
		backgroundDark !== '' &&
		(background === undefined || background === '')
	) {
		console.warn(
			`[astro-media-kit] ${componentName}: \`backgroundDark\` is set without \`background\` — light mode will be transparent.`,
		)
	}
}

/**
 * Dev-only warning when a remote source is passed without enough information
 * for `getImage()` to size the image. Astro requires either `width` + `height`
 * or `inferSize: true` on remote URLs; without one of those `getImage()`
 * throws. Surfaced up front so the actionable fix is obvious.
 */
export function warnRemoteMissingDimsOrInferSize(
	componentName: 'Image' | 'Picture',
	src: string,
	options: {
		height?: `${number}` | number | undefined
		inferSize?: boolean | undefined
		width?: `${number}` | number | undefined
	},
): void {
	if (!import.meta.env.DEV) {
		return
	}

	const hasDims = options.width !== undefined && options.height !== undefined
	if (hasDims || options.inferSize) {
		return
	}

	console.warn(
		`[astro-media-kit] ${componentName}: remote source "${src}" needs \`width\` + \`height\` or \`inferSize\` — \`getImage()\` will throw otherwise. Set both dimensions, or pass \`inferSize\` to probe the URL at build time.`,
	)
}

/**
 * Dev-only warning for a remote `src` with a local `srcDark`: a dark variant
 * needs the same kind of source as its light one, so the local one is skipped.
 */
export function warnRemoteLocalSrcDark(componentName: 'Image' | 'Picture'): void {
	if (import.meta.env.DEV) {
		console.warn(
			`[astro-media-kit] ${componentName}: \`srcDark\` is a local image but \`src\` is remote. Mixed local/remote dark pairs are not supported — \`srcDark\` is ignored.`,
		)
	}
}

export { needsBackgroundDarkVariant, opaqueFormats } from '../../utilities/dark-variant'
