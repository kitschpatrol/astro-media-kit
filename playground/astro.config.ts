/* eslint-disable ts/naming-convention */
import mdx from '@astrojs/mdx'
import mdxKit, { tldrawDarkImport } from 'astro-mdx-kit'
import mediaKit from 'astro-media-kit'
import { defineConfig } from 'astro/config'

process.env.BROWSER = 'chromium'

export default defineConfig({
	image: {
		layout: 'constrained',
		responsiveStyles: true,
	},
	integrations: [
		mediaKit({
			aphex: true,
			autoImport: {
				components: {
					Image: 'src',
					Picture: ['src', tldrawDarkImport],
					Zoomer: ['src', tldrawDarkImport],
				},
			},
			tldraw: true,
			watermark: true,
		}),
		mdxKit({
			attributes: true,
			directives: {
				Audio: {
					component: 'Audio',
					componentModule: 'astro-media-kit/components',
				},
				Video: {
					component: 'Video',
					componentModule: 'astro-media-kit/components',
				},
			},
			elements: {
				img: {
					autoImport: ['src', tldrawDarkImport],
					caption: 'figure',
					component: 'Picture',
					componentModule: 'astro-media-kit/components',
				},
			},
			unwrapImages: true,
		}),
		// GFM enabled by default
		mdx(),
	],
})
