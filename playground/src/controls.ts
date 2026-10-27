type Options = readonly [string, ...string[]]
type Controls = Record<string, Options>

const zoom = {
	zoom: ['false', 'true'],
	zoomLevel: ['fit', 'fill', 'native'],
	zoomPlaceholder: ['auto', 'none'],
} as const

const playback = {
	autoPlay: ['false', 'true'],
	loop: ['false', 'true'],
	muted: ['true', 'false'],
	preload: ['metadata', 'none', 'auto'],
} as const

const image = {
	background: ['none', '#ffffff', '#e8e4d0'],
	credit: ['true', 'false'],
	layout: ['constrained', 'full-width', 'fixed', 'none'],
	quality: ['mid', 'low', 'high'],
	src: ['photo', 'tiger'],
	width: ['640', '320', '960'],
	...zoom,
} as const

export const demos = {
	audio: {
		controls: {
			src: ['/test.mp3', '6836449'],
			...playback,
			credit: ['true', 'false'],
			muted: ['false', 'true'],
		},
		title: 'Audio',
	},
	caption: {
		controls: {
			creator: ['Test Creator', 'none'],
			organization: ['Test Organization', 'none'],
			showCredit: ['true', 'false'],
			type: ['photo', 'image', 'illustration', 'video', 'audio'],
		},
		title: 'Caption',
	},
	carousel: {
		controls: {
			captions: ['false', 'true'],
			dots: ['false', 'true'],
			zoom: ['false', 'true'],
			zoomLevel: ['fit', 'fill', 'native'],
		},
		title: 'Carousel',
	},
	image: {
		controls: { ...image, format: ['webp', 'png', 'jpg'] },
		title: 'Image',
	},
	picture: {
		controls: {
			...image,
			darkMode: ['media', 'none'],
			fallbackFormat: ['png', 'jpg'],
			formats: ['webp', 'avif,webp'],
		},
		title: 'Picture',
	},
	video: {
		controls: {
			controls: ['full', 'minimal', 'none', 'native', 'lightbox'],
			src: ['/test.mp4', '15722237', 'dQw4w9WgXcQ'],
			...playback,
			poster: ['none', '/test-poster.jpeg'],
			...zoom,
		},
		title: 'Video',
	},
	'zoom-link': {
		controls: {
			src: ['photo', 'tiger', '/test.mp4'],
			zoomLevel: ['fit', 'fill', 'native'],
		},
		title: 'ZoomLink',
	},
	zoomer: {
		controls: {
			enabled: ['true', 'false'],
			href: ['none', '/test.jpeg'],
			level: ['fit', 'fill', 'native'],
			placeholder: ['auto', 'none'],
		},
		title: 'Zoomer',
	},
} as const satisfies Record<string, { controls: Controls; title: string }>

/** Read only the supported dropdown choices, falling back to each first option. */
export function readControls<T extends Controls>(
	controls: T,
	search: URLSearchParams,
): { [Key in keyof T]: T[Key][number] } {
	return Object.fromEntries(
		Object.entries(controls).map(([name, options]) => [
			name,
			options.find((option) => option === search.get(name)) ?? options[0],
		]),
	) as { [Key in keyof T]: T[Key][number] }
}
