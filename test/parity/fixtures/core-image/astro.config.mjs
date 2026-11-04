import mediaKit from 'astro-media-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	image: {
		dangerouslyProcessSVG: true,
	},
	integrations: [mediaKit()],
})
