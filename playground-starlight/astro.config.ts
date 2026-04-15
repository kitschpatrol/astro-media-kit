/* eslint-disable ts/naming-convention */

import starlight from '@astrojs/starlight'
import mdxKit, { tldrawDarkImport } from 'astro-mdx-kit'
import mediaKit from 'astro-media-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	integrations: [
		mediaKit({
			aphex: true,
			autoImport: {
				components: {
					Image: 'src',
					Picture: ['src'],
				},
			},
			tldraw: true,
		}),
		mdxKit({
			attributes: true,
			captionImages: true,
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
					autoImport: ['src', 'srcDark', tldrawDarkImport],
					caption: 'figure',
					component: 'Picture',
					componentModule: 'astro-media-kit/components',
				},
			},
			unwrapImages: true,
		}),
		starlight({
			sidebar: [
				{
					items: [
						{ label: 'Picture', slug: 'components/picture' },
						{ label: 'Video', slug: 'components/video' },
						{ label: 'Audio', slug: 'components/audio' },
						{ label: 'Caption', slug: 'components/caption' },
						{ label: 'Zoom', slug: 'components/zoom' },
					],
					label: 'Components',
				},
				{
					items: [{ label: 'Syntax & Directives', slug: 'mdx/syntax' }],
					label: 'MDX',
				},
			],
			title: 'astro-media-kit',
		}),
	],
})
