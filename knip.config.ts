import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignoreFiles: ['src/utilities/passthrough-image-endpoint.ts'],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
