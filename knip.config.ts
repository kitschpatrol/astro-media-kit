import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: ['references/**/*'],
	ignoreDependencies: ['@types/unist'],
	ignoreFiles: ['playground/**/*', 'playground-starlight/**/*'],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
