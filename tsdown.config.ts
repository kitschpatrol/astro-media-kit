import { defineConfig } from 'tsdown'

export default defineConfig({
	attw: {
		entrypoints: ['.', './integration'],
		profile: 'esm-only',
	},
	clean: true,
	copy: [
		{
			flatten: false,
			from: 'src/**/*.astro',
		},
		{
			flatten: false,
			from: 'src/**/*.astro.d.ts',
		},
		{
			flatten: false,
			from: 'src/**/*.css',
		},
	],
	deps: {
		neverBundle: [/\.astro$/],
	},
	dts: true,
	entry: [
		'src/index.ts',
		'src/components.ts',
		'src/integration/index.ts',
		'src/types.ts',
		'src/env.d.ts',
		'src/components/utils/image.ts',
		'src/components/utils/video.ts',
		'src/components/utils/audio.ts',
		'src/components/utils/bunny.ts',
		'src/components/utils/cloudflare.ts',
		'src/components/utils/lightbox.ts',
		'src/components/utils/mux.ts',
		'src/components/internal/audio-types.ts',
		'src/components/internal/types.ts',
		'src/utilities/dark-variant.ts',
		'src/utilities/image-probe.ts',
		'src/utilities/path.ts',
		'src/utilities/passthrough-image-endpoint.ts',
	],
	fixedExtension: false,
	outDir: 'dist',
	platform: 'node',
	publint: true,
	tsconfig: 'tsconfig.build.json',
})
