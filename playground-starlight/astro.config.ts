/* eslint-disable ts/naming-convention */

import starlight from '@astrojs/starlight'
import mdxKit from 'astro-mdx-kit'
import { defineConfig } from 'astro/config'

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
				h2: 'src/components/HeadingTwo.astro',
				// Temp off
				// img: {
				// 	component: 'Picture',
				// 	componentModule: 'astro:assets',
				// },
			},
			unwrapImages: true,
		}),
		starlight({
			sidebar: [
				{
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Example Guide', slug: 'guides/example' },
					],
					label: 'Guides',
				},
				{
					autogenerate: { directory: 'reference' },
					label: 'Reference',
				},
			],
			social: [{ href: 'https://github.com/withastro/starlight', icon: 'github', label: 'GitHub' }],
			title: 'My Docs',
		}),
	],
})
