import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignoreDependencies: [
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
