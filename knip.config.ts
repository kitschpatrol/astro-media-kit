import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignoreDependencies: [
		// Invoked as `astro check` by ksc-typescript, which knip can't see
		'@astrojs/check',
		'@types/unist',
		'@kitschpatrol/unplugin-aphex',
		'@kitschpatrol/unplugin-tldraw',
		'node-addon-api',
		'node-gyp',
	],
	ignoreFiles: [
		'playground/**/*',
		'playground-starlight/**/*',
		'src/utilities/passthrough-image-endpoint.ts',
	],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
