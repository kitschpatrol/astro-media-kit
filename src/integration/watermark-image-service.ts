import type { SharpImageServiceConfig } from 'astro/assets/services/sharp'
import baseSharpService, { resolveSharpEncoderOptions } from 'astro/assets/services/sharp'
import prettyBytes from 'pretty-bytes'
import sharp from 'sharp'

/**
 * Resolved watermark runtime config, stashed on the Astro image service config
 * under the `mediaKitWatermark` key by the integration.
 */
export type ResolvedWatermarkConfig = {
	angle: number
	minDimension: number
	opacity: number
}

/**
 * Combined service config: passes through sharp's own config, plus our
 * watermark settings.
 */
type WatermarkServiceConfig = SharpImageServiceConfig & {
	mediaKitWatermark?: ResolvedWatermarkConfig
}

/** Formats we refuse to re-encode (SVG stays vector). */
const SKIP_FORMATS = new Set(['svg'])

function escapeXml(input: string): string {
	return input
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
}

/**
 * Build an SVG sized to the variant that tiles a rotated label repeating the
 * dimensions and byte count across the whole frame. Returned as a `Uint8Array`
 * ready for `sharp.composite`.
 */
function buildTiledStampSvg(
	width: number,
	height: number,
	bytes: number,
	config: ResolvedWatermarkConfig,
): Uint8Array {
	const label = `${width} × ${height} · ${prettyBytes(bytes, {
		maximumFractionDigits: 0,
	})}`
	// Font size scales gently with the smaller dimension so tiny thumbs still read.
	const shortEdge = Math.min(width, height)
	const fontSize = Math.max(30, Math.min(50, Math.round(shortEdge / 22)))
	// Rough metric: monospace glyphs are ~0.6em wide.
	const labelWidthPx = label.length * fontSize * 0.6
	const tileWidth = Math.ceil(labelWidthPx + fontSize * 4)
	const tileHeight = Math.ceil(fontSize * 3)
	const strokeWidth = Math.max(2, Math.round(fontSize / 10))
	const safeLabel = escapeXml(label)

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
	<defs>
		<pattern id="stamp" patternUnits="userSpaceOnUse" width="${tileWidth}" height="${tileHeight}" patternTransform="rotate(${config.angle})">
			<text x="${tileWidth / 2}" y="${tileHeight / 2}" text-anchor="middle" dominant-baseline="middle" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${fontSize}" font-weight="700" fill="#ffffff" fill-opacity="${config.opacity}" stroke="#000000" stroke-opacity="${config.opacity}" stroke-width="${strokeWidth}" paint-order="stroke fill">${safeLabel}</text>
		</pattern>
	</defs>
	<rect width="${width}" height="${height}" fill="url(#stamp)"/>
</svg>`
	return new TextEncoder().encode(svg)
}

type EncoderOptions = ReturnType<typeof resolveSharpEncoderOptions>

/**
 * Read encoder options the base sharp service would use, so we re-encode with
 * matching quality.
 */
function encoderOptions(
	imageConfig: { service: { config: WatermarkServiceConfig } },
	format: string,
	quality: string | undefined,
): EncoderOptions {
	return resolveSharpEncoderOptions(
		quality === undefined ? { format } : { format, quality },
		format,
		imageConfig.service.config,
	)
}

console.info('[astro-media-kit] watermark image service loaded')

const service: typeof baseSharpService = {
	...baseSharpService,
	async transform(inputBuffer, transform, imageConfig) {
		const base = await baseSharpService.transform(inputBuffer, transform, imageConfig)
		const cfg = (imageConfig.service.config as WatermarkServiceConfig).mediaKitWatermark

		if (!cfg) return base
		if (SKIP_FORMATS.has(base.format)) return base

		const baseBuffer = Buffer.from(base.data)
		const { height, pages, width } = await sharp(baseBuffer).metadata()
		// Animated formats (GIF, animated WebP): compositing flattens to a single frame.
		if (pages !== undefined && pages > 1) return base
		if (width < cfg.minDimension || height < cfg.minDimension) return base

		const overlay = Buffer.from(buildTiledStampSvg(width, height, baseBuffer.byteLength, cfg))
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- sharp.toFormat accepts all image output formats
		const format = base.format as Parameters<ReturnType<typeof sharp>['toFormat']>[0]
		const quality = typeof transform.quality === 'string' ? transform.quality : undefined
		const composited = await sharp(baseBuffer)
			.composite([{ input: overlay, left: 0, top: 0 }])
			.toFormat(format, encoderOptions(imageConfig, base.format, quality))
			.toBuffer()

		console.info(
			`[astro-media-kit] watermarked ${width}×${height} ${base.format} (${prettyBytes(
				baseBuffer.byteLength,
				{
					maximumFractionDigits: 0,
				},
			)} → ${prettyBytes(composited.byteLength, {
				maximumFractionDigits: 0,
			})})`,
		)

		return { data: composited, format: base.format }
	},
}

export default service
