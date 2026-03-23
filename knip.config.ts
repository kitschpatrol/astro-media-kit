import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: ['references/**/*'],
	ignoreDependencies: ['@types/unist', 'photoswipe'],
	ignoreFiles: ['playground/**/*', 'playground-starlight/**/*'],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
