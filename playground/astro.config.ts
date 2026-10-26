/* eslint-disable ts/naming-convention */
import { unified } from '@astrojs/markdown-remark'
import mdx from '@astrojs/mdx'
import mdxKit, { tldrawDarkImport } from 'astro-mdx-kit'
import mediaKit, { imageOnlyImport } from 'astro-media-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	image: {
		dangerouslyProcessSVG: true,
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
					ZoomLink: imageOnlyImport,
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
	markdown: {
		// Stick with Unified for attributes
		processor: unified(),
	},
})
