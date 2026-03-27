/* eslint-disable ts/naming-convention */
import mdx from '@astrojs/mdx'
import mdxKit, { tldrawDarkImport } from 'astro-mdx-kit'
import mediaKit from 'astro-media-kit/integration'
import { defineConfig } from 'astro/config'

process.env.BROWSER = 'chromium'

export default defineConfig({
	integrations: [
		mediaKit({
			aphex: true,
			autoImport: {
				components: {
					Image: 'src',
					Picture: ['src', tldrawDarkImport],
				},
			},
			tldraw: true,
		}),
		mdxKit({
			attributes: true,
			directives: {
				Video: {
					component: 'VideoHls',
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
