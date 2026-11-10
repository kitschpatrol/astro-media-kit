import mediaKit from 'astro-media-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	// The browser tests serve this build from a folder of the main fixture's
	base: '/themed',
	integrations: [
		mediaKit({
			icons: {
				// A path from the project root, a URL, and markup itself
				close: './src/icons/close.svg',
				expand: new URL('src/icons/expand.svg', import.meta.url),
				next: '<svg data-custom-icon="next" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" stroke="currentColor" /></svg>',
				play: '<svg data-custom-icon="play" viewBox="0 0 24 24"><path d="m8 4 12 8-12 8Z" /></svg>',
			},
			// Some in other words, and the rest left as they are
			labels: {
				close: 'Shut',
				goToSlide: 'Picture {index}',
				next: 'Onward',
				playbackControls: 'Playing controls',
				slide: 'Picture {index} out of {count}',
				viewer: 'Media "viewing" & more',
			},
		}),
	],
})
