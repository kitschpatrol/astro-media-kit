/* eslint-disable ts/naming-convention */
import mdx from '@astrojs/mdx'
import mdxKit from 'astro-mdx-kit'
import { defineConfig } from 'astro/config'

process.env.BROWSER = 'chromium'

export default defineConfig({
	integrations: [
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
