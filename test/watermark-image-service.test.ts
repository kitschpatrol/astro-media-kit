import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import watermarkService from '../src/integration/watermark-image-service'

type WatermarkFlags = { angle: number; minDimension: number; opacity: number }

const defaultWatermarkConfig: WatermarkFlags = { angle: -30, minDimension: 96, opacity: 0.6 }

function makeImageConfig(mediaKitWatermark: undefined | WatermarkFlags) {
	return {
		service: {
			config: mediaKitWatermark === undefined ? {} : { mediaKitWatermark },
			entrypoint: 'astro-media-kit/integration/watermark-image-service',
		},
	}
}

async function makePng(width: number, height: number): Promise<Uint8Array> {
	const buffer = await sharp({
		create: {
			background: { r: 200, g: 150, b: 80 },
			channels: 3,
			height,
			width,
		},
	})
		.png()
		.toBuffer()
	return new Uint8Array(buffer)
}

async function runTransform(
	input: Uint8Array,
	mediaKitWatermark: undefined | WatermarkFlags,
): Promise<{ data: Uint8Array; format: string }> {
	const imageConfig = makeImageConfig(mediaKitWatermark)
	return watermarkService.transform(
		input,
		{ format: 'png', src: '/test.png' },
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- narrow test stub, full ImageConfig has heavy generics
		imageConfig as Parameters<typeof watermarkService.transform>[2],
	)
}

// Sharp + librsvg can have significant cold-start cost on Windows CI (font
// cache init), so allow extra time for the first composite.
describe('watermark image service', { timeout: 30_000 }, () => {
	it('stamps a PNG variant above the min dimension', async () => {
		const input = await makePng(400, 300)
		const result = await runTransform(input, defaultWatermarkConfig)

		expect(result.format).toBe('png')
		const meta = await sharp(result.data).metadata()
		expect(meta.width).toBe(400)
		expect(meta.height).toBe(300)
		// Output differs from input: the watermark was composited in.
		expect(result.data.length === input.length && result.data.every((v, i) => v === input[i])).toBe(
			false,
		)
	})

	it('skips images smaller than minDimension', async () => {
		const input = await makePng(40, 40)
		const watermarked = await runTransform(input, defaultWatermarkConfig)
		// eslint-disable-next-line unicorn/no-useless-undefined -- explicit parameter
		const bypass = await runTransform(input, undefined)
		expect(watermarked.data.length).toBe(bypass.data.length)
	})

	it('passes through when watermark config is absent', async () => {
		const input = await makePng(400, 300)
		const withConfig = await runTransform(input, defaultWatermarkConfig)
		// eslint-disable-next-line unicorn/no-useless-undefined -- explicit parameter
		const withoutConfig = await runTransform(input, undefined)
		expect(withConfig.data.length === withoutConfig.data.length).toBe(false)
	})
})
