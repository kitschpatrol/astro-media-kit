/* eslint-disable ts/naming-convention */
import { unified } from '@astrojs/markdown-remark'
import mdx from '@astrojs/mdx'
import node from '@astrojs/node'
import mdxKit, { tldrawDarkImport } from 'astro-mdx-kit'
import mediaKit, { imageOnlyImport } from 'astro-media-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	adapter: node({ mode: 'standalone' }),
	image: {
		dangerouslyProcessSVG: true,
		// For the remote source on the prop controls pages
		domains: ['raw.githubusercontent.com'],
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
			// Outlined artwork, shown off on the Media theme page
			icons: {
				close: './src/icons/close.svg',
				expand: './src/icons/expand.svg',
				next: './src/icons/next.svg',
				pause: './src/icons/pause.svg',
				play: './src/icons/play.svg',
				previous: './src/icons/previous.svg',
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
					component: 'src/components/CustomPicture.astro',
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
