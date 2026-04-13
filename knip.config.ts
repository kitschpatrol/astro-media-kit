import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: ['references/**/*'],
	ignoreDependencies: [
		'@types/unist',
		'@kitschpatrol/unplugin-aphex',
		'@kitschpatrol/unplugin-tldraw',
		'node-addon-api',
		'node-gyp',
		'remark-directive',
		'remark-attribute-list',
	],
	ignoreFiles: ['playground/**/*', 'playground-starlight/**/*'],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
