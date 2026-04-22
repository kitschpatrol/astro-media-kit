/**
 * Shared orchestration helpers for the `<Image>` and `<Picture>` components.
 *
 * Both components resolve a user-supplied source (ImageMetadata / DarkLight
 * pair / string path) into optimized image variants via Astro's `getImage()`.
 * This module consolidates the non-template pieces of that pipeline: src
 * resolution, layout defaults, background compositing, transparency-aware
 * fallback-format selection, srcset/mime building, and dev-only warnings.
 */

import type { ImageMetadata, ImageOutputFormat } from 'astro'
import type { getImage, imageConfig } from 'astro:assets'
import * as mime from 'mrmime'
import type { DarkLightImageMetadata, ImageMetadataLike } from '../../types'
import { opaqueFormats } from '../../utilities/dark-variant'
import {
	isDarkLightImageMetadata,
	isImageMetadataObject,
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

/** Default output formats for `<Picture>` sources when the user doesn't specify. */
export const defaultFormats = ['webp'] as const

/**
 * Default `<img>` fallback format when the input format isn't
 * transparency-sensitive.
 */
export const defaultFallbackFormat: ImageOutputFormat = 'png'

/**
 * Input formats that should stay in-format for the `<img>` fallback rather than
 * being converted to `png`.
 */
export const specialFormatsFallback = ['gif', 'svg', 'jpg', 'jpeg'] as const

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
export async function resolveSrc(
	src: ImageMetadata | Promise<{ default: ImageMetadata }> | string,
): Promise<ImageMetadata | string> {
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

	let imageMetadata: ImageMetadata
	let imageMetadataDark: ImageMetadata | undefined

	if (isDarkLightImageMetadata(src)) {
		imageMetadata = src.light
		if (srcDarkSource) {
			imageMetadataDark = isImageMetadataObject(srcDarkSource)
				? unwrapImageMetadata(srcDarkSource)
				: // eslint-disable-next-line ts/no-unsafe-type-assertion -- resolveImageSource returns ImageMetadata when called without srcDark
					((await resolveImageSource(srcDarkSource)) as ImageMetadata)
		} else if (!options.darkDisabled) {
			imageMetadataDark = src.dark
		}
	} else if (isImageMetadataObject(src)) {
		imageMetadata = unwrapImageMetadata(src)
		if (srcDarkSource) {
			imageMetadataDark = isImageMetadataObject(srcDarkSource)
				? unwrapImageMetadata(srcDarkSource)
				: // eslint-disable-next-line ts/no-unsafe-type-assertion -- resolveImageSource returns ImageMetadata when called without srcDark
					((await resolveImageSource(srcDarkSource)) as ImageMetadata)
		}
	} else {
		const resolved = srcDarkSource
			? await resolveImageSource(src, srcDarkSource)
			: await resolveImageSource(src)

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
	} else if (config.objectFit ?? config.objectPosition) {
		merged.fit ??= config.objectFit
		merged.position ??= config.objectPosition
	}

	return { layout, merged, useResponsive }
}

/**
 * Return a `{ background }` fragment only when the output format is opaque
 * (JPEG) — these formats lose transparency, so we composite the user's
 * background color into the pixels. Transparent formats (PNG, WebP, AVIF, SVG)
 * get the background via CSS instead.
 */
export function compositingBackground(
	format: string | undefined,
	background?: string,
): Record<string, string> {
	return background && opaqueFormats.has(format!) ? { background } : {}
}

/**
 * Pick the `<img>` fallback format. Transparency-aware: when the input format
 * is in `specialFormatsFallback` (gif/svg/jpg/jpeg) we keep that format so we
 * don't flatten animations, rasterize vectors, or double-encode JPEGs.
 * Otherwise default to PNG.
 */
export function pickFallbackFormat(
	fallbackFormatProp: ImageOutputFormat | undefined,
	resolvedSrc: ImageMetadata | string,
): ImageOutputFormat {
	if (fallbackFormatProp) return fallbackFormatProp
	if (
		isESMImportedImage(resolvedSrc) &&
		(specialFormatsFallback as readonly string[]).includes(resolvedSrc.format)
	) {
		return resolvedSrc.format as ImageOutputFormat
	}

	return defaultFallbackFormat
}

/**
 * Clone an ImageMetadata object using Astro's private `.clone` helper so
 * downstream code (e.g. getImage) doesn't see the same reference twice —
 * otherwise Astro warns about the asset being used outside the optimization
 * pipeline. Falls through for string paths.
 */
export function cloneImageMetadata(src: ImageMetadata | string): ImageMetadata | string {
	if (!isESMImportedImage(src)) return src

	const withClone = src as ImageMetadata & { clone?: ImageMetadata }
	return withClone.clone ?? src
}

const SCOPED_STYLE_CLASS_REGEX = /\bastro-\w{8}\b/

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
		const light = background ? `background-color:${background}` : undefined
		const darkBg = backgroundDark ?? background
		const dark = darkBg ? `background-color:${darkBg}` : undefined
		return { dark, light }
	}

	let light: string | undefined
	if (background && backgroundDark) {
		light = `color-scheme:light dark;background-color:light-dark(${background},${backgroundDark})`
	} else if (backgroundDark) {
		light = `color-scheme:light dark;background-color:light-dark(transparent,${backgroundDark})`
	} else if (background) {
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
 * `.srcSet.attribute` directly.
 */
export function buildSrcsetAttribute(
	image: GetImageResult,
	props: SrcsetBuildProps,
	useResponsive: boolean,
): string {
	const { densities, widths } = props
	if (densities ?? (!widths && !useResponsive)) {
		return `${image.src}${image.srcSet.values.length > 0 ? `, ${image.srcSet.attribute}` : ''}`
	}

	return image.srcSet.attribute
}

/**
 * Resolve the final `sizes` attribute value. When the user supplied `sizes`,
 * it's passed through unchanged. When Astro auto-generated `sizes` (responsive
 * layout without an explicit user value), the result is prefixed with `"auto, "`
 * so lazy-loaded images can use the browser's auto-sizes behavior. Returns
 * `undefined` when no sizes value is present.
 */
export function resolveSizesAttribute(
	userSizes: string | undefined,
	sizes: string | undefined,
): string | undefined {
	if (sizes === undefined) return undefined
	if (userSizes !== undefined) return sizes
	return `auto, ${sizes}`
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
	if (!import.meta.env.DEV) return
	if (!props.widths || props.widths.length === 0) return
	const hasDensities = props.densities !== undefined && props.densities.length > 0
	const hasSizes = props.sizes !== undefined && props.sizes.length > 0
	if (hasDensities || hasSizes || useResponsive) return
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
	if (backgroundDark && !background) {
		console.warn(
			`[astro-media-kit] ${componentName}: \`backgroundDark\` is set without \`background\` — light mode will be transparent.`,
		)
	}
}

/**
 * Dev-only warning emitted when a remote URL is passed with media-kit props
 * that require local file bytes (background compositing, a `{ dark, light }`
 * pair or local `ImageMetadata` override for `srcDark`). The affected feature
 * is silently skipped — this warning is the user's breadcrumb.
 */
export function warnRemoteIncompatibleProps(
	componentName: 'Image' | 'Picture',
	conflicts: {
		background?: unknown
		backgroundDark?: unknown
		pairSrc?: boolean
		srcDarkIsLocal?: boolean
	},
): void {
	if (!import.meta.env.DEV) return
	if (conflicts.background !== undefined) {
		console.warn(
			`[astro-media-kit] ${componentName}: \`background\` is ignored for remote image sources — compositing requires a known input format. Skip \`background\` or use a local source.`,
		)
	}

	if (conflicts.backgroundDark !== undefined) {
		console.warn(
			`[astro-media-kit] ${componentName}: \`backgroundDark\` is ignored for remote image sources — compositing requires a known input format. Skip \`backgroundDark\` or use a local source.`,
		)
	}

	if (conflicts.pairSrc) {
		console.warn(
			`[astro-media-kit] ${componentName}: received a \`{ dark, light }\` pair mixed with a remote source. Pass either two remote URL strings (via \`src\` and \`srcDark\`) or two local ImageMetadata objects.`,
		)
	}

	if (conflicts.srcDarkIsLocal) {
		console.warn(
			`[astro-media-kit] ${componentName}: \`srcDark\` is a local image but \`src\` is remote. Mixed local/remote dark pairs are not supported — \`srcDark\` is ignored.`,
		)
	}
}

export { needsBackgroundDarkVariant, opaqueFormats } from '../../utilities/dark-variant'
