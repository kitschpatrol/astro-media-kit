import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	// Agent skills are loaded by tooling rather than imported by source code.
	ignoreDependencies: ['@videojs/skills'],
	ignoreFiles: ['src/utilities/passthrough-image-endpoint.ts'],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
