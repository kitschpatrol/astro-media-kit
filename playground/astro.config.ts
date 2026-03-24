/* eslint-disable ts/naming-convention */
import mdx from '@astrojs/mdx'
import mdxKit from 'astro-mdx-kit'
import mediaKit from 'astro-media-kit/integration'
import { defineConfig } from 'astro/config'

process.env.BROWSER = 'chromium'

export default defineConfig({
	integrations: [
		mediaKit({
			aphex: true,
			autoImport: true,
			tldraw: true,
		}),
		mdxKit({
			attributes: true,
			captionImages: true,
			directives: {
				Block: 'src/components/Block.astro',
				CustomImage: {
					autoImport: 'src',
					component: 'src/components/CustomImage.astro',
				},
			},
			elements: {
				h1: 'src/components/Heading.astro',
				// Temp off
				// img: {
				// 	component: 'Picture',
				// 	componentModule: 'astro:assets',
				// },
			},
			unwrapImages: true,
		}),
		// GFM enabled by default
		mdx(),
	],
})
