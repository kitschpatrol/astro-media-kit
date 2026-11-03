import type { Props as AudioProps } from 'astro-media-kit/components/Audio.astro'
import type { Props as CaptionProps } from 'astro-media-kit/components/Caption.astro'
import type { Props as CarouselProps } from 'astro-media-kit/components/Carousel.astro'
import type { Props as ImageProps } from 'astro-media-kit/components/Image.astro'
import type { Props as PictureProps } from 'astro-media-kit/components/Picture.astro'
import type { Props as VideoProps } from 'astro-media-kit/components/Video.astro'
import type { Props as ZoomerProps } from 'astro-media-kit/components/Zoomer.astro'
import type { Props as ZoomLinkProps } from 'astro-media-kit/components/ZoomLink.astro'
import type { HTMLAttributes } from 'astro/types'
import photoDark from './assets/test-dark.jpeg'
import photo from './assets/test.jpeg'
import tigerDark from './assets/tiger-dark.svg'
import tiger from './assets/tiger.svg'

type Primitive = boolean | number | string | undefined

/**
 * A dropdown entry: a primitive, labelled by its string form, or a `[label,
 * value]` pair for anything else.
 */
type Choice<Value> = Extract<Value, Primitive> | readonly [label: string, value: Value]

/**
 * Dropdown entries for every prop. An optional prop's entries start with
 * `undefined`, which leaves it unset, so the first entries are the component's
 * own defaults.
 */
type Controls<Props> = {
	readonly [Name in keyof Props]-?: undefined extends Props[Name]
		? readonly [undefined, ...Array<Choice<Props[Name]>>]
		: readonly [Choice<Props[Name]>, ...Array<Choice<Props[Name]>>]
}

type Demo<Props> = {
	controls: Controls<Props>
	title: string
}

/**
 * `<img>` attributes the image components pass through untouched, left out of
 * the controls. `alt`, `class`, `sizes`, and the dimensions shape the output.
 */
type PassthroughAttribute = Exclude<
	keyof HTMLAttributes<'img'>,
	'alt' | 'class' | 'height' | 'sizes' | 'src' | 'width'
>

type ImageControlProps = Omit<ImageProps, PassthroughAttribute>

// Picture accepts Astro's `format`, but its `formats` and `fallbackFormat` replace it
type PictureControlProps = Omit<PictureProps, 'format' | PassthroughAttribute>

/** Props a carousel demo passes to each of its slides. */
type SlideProps = Pick<ImageProps, 'zoom' | 'zoomLevel'>

type Demos = {
	audio: Demo<AudioProps>
	caption: Demo<CaptionProps>
	carousel: Demo<CarouselProps & SlideProps>
	image: Demo<ImageControlProps>
	picture: Demo<PictureControlProps>
	video: Demo<VideoProps>
	'zoom-link': Demo<ZoomLinkProps>
	zoomer: Demo<ZoomerProps>
}

const mediaTypes = [
	'animation',
	'audio',
	'diagram',
	'illustration',
	'image',
	'photo',
	'render',
	'screenshot',
	'video',
] as const

const credit = {
	credit: [undefined, true, false, 'Test Creator'],
	creditMediaType: [undefined, ...mediaTypes],
	creditOrganization: [undefined, 'Test Organization'],
} satisfies Controls<Pick<VideoProps, 'credit' | 'creditMediaType' | 'creditOrganization'>>

const zoom = {
	zoom: [undefined, true, false, 'gallery'],
	zoomLevel: [undefined, 'fit', 'fill', 'native'],
	zoomScope: [undefined, '.component-preview'],
} satisfies Controls<Pick<ImageProps, 'zoom' | 'zoomLevel' | 'zoomScope'>>

const zoomPlaceholder = [
	undefined,
	'auto',
	'none',
] satisfies Controls<ImageProps>['zoomPlaceholder']

const className = {
	class: [undefined, 'outlined'],
	className: [undefined, 'outlined'],
} satisfies Controls<Pick<ImageProps, 'class' | 'className'>>

const playback = {
	autoPlay: [undefined, true, false],
	loop: [undefined, true, false],
	muted: [undefined, true, false],
	preload: [undefined, 'none', 'metadata', 'auto'],
} satisfies Controls<Pick<VideoProps, 'autoPlay' | 'loop' | 'muted' | 'preload'>>

const image = {
	...className,
	...credit,
	...zoom,
	alt: ['Sample image', ['empty', '']],
	background: [undefined, '#ffffff', '#e8e4d0'],
	backgroundDark: [undefined, '#222222', '#3a3550'],
	creditMediaTypeFallback: [undefined, ...mediaTypes],
	densities: [undefined, ['1x, 2x', [1, 2]], ['1x, 1.5x, 2x', [1, 1.5, 2]]],
	fit: [undefined, 'cover', 'contain', 'fill', 'none', 'scale-down'],
	height: [undefined, 240, 480],
	inferSize: [undefined, true, false],
	layout: [undefined, 'constrained', 'full-width', 'fixed', 'none'],
	position: [undefined, 'center', 'top', 'bottom', 'left', 'right'],
	priority: [undefined, true, false],
	quality: [undefined, 'low', 'mid', 'high', 'max', 10, 90],
	sizes: [undefined, '320px', '(min-width: 800px) 640px, 100vw'],
	src: [
		['photo', photo],
		['tiger', tiger],
		['photo pair', { dark: photoDark, light: photo }],
		['tiger pair', { dark: tigerDark, light: tiger }],
		[
			'remote',
			'https://raw.githubusercontent.com/kitschpatrol/astro-media-kit/main/playground/public/test.jpeg',
		],
	],
	width: [undefined, 320, 640, 960],
	widths: [undefined, ['320, 640', [320, 640]], ['320, 640, 960', [320, 640, 960]]],
	zoomIndicator: [undefined, true, false],
	zoomPlaceholder,
} satisfies Controls<Omit<ImageControlProps, 'format'>>

const definitions = {
	audio: {
		controls: {
			...credit,
			...playback,
			label: [undefined, 'Sample audio'],
			service: [undefined, 'local', 'oembed', 'soundcloud'],
			src: [
				['local file', '/test.mp3'],
				['SoundCloud ID', '6836449'],
				['SoundCloud URL', 'https://soundcloud.com/kitschpatrol/drona'],
			],
		},
		title: 'Audio',
	},
	caption: {
		controls: {
			creator: [undefined, 'Test Creator'],
			organization: [undefined, 'Test Organization'],
			showCredit: [undefined, true, false],
			type: [undefined, ...mediaTypes],
		},
		title: 'Caption',
	},
	carousel: {
		controls: {
			...className,
			captions: [undefined, true, false],
			dots: [undefined, true, false],
			label: [undefined, 'Sample carousel'],
			zoom: zoom.zoom,
			zoomLevel: zoom.zoomLevel,
		},
		title: 'Carousel',
	},
	image: {
		controls: {
			...image,
			format: [
				undefined,
				'webp',
				'avif',
				'png',
				'jpg',
				'svg',
				['rules: jpg → avif, svg → png', { jpg: 'avif', svg: 'png' }],
			],
		},
		title: 'Image',
	},
	picture: {
		controls: {
			...image,
			darkMode: [undefined, 'media', 'none', "[data-theme='dark']"],
			fallbackFormat: [
				undefined,
				'png',
				'jpg',
				'webp',
				'avif',
				'svg',
				['rules: jpg → webp, svg → png', { jpg: 'webp', svg: 'png' }],
			],
			formats: [
				undefined,
				['webp', ['webp']],
				['avif, webp', ['avif', 'webp']],
				['empty', []],
				['rules: svg → svg', { svg: ['svg'] }],
			],
			pictureAttributes: [undefined, ['outlined', { class: 'outlined' }]],
			srcDark: [undefined, true, false, ['photo dark', photoDark], ['tiger dark', tigerDark]],
		},
		title: 'Picture',
	},
	video: {
		controls: {
			...credit,
			...playback,
			...zoom,
			capQualityToSize: [undefined, true, false],
			controls: [undefined, 'full', 'minimal', 'lightbox', 'native', 'none'],
			initialBandwidth: [undefined, ['500 kb/s', 500_000], ['50 Mb/s', 50_000_000]],
			label: [undefined, 'Sample video'],
			poster: [undefined, '/test-poster.jpeg'],
			service: [undefined, 'local', 'youtube', 'vimeo', 'bunny', 'cloudflare', 'mux', 'oembed'],
			src: [
				['local file', '/test.mp4'],
				['Vimeo ID', '15722237'],
				['YouTube ID', 'dQw4w9WgXcQ'],
				['Bunny ID', 'f24d7806-2cf5-4df9-a340-840d68eef8c9'],
				['TED page', 'https://www.ted.com/talks/hans_rosling_the_best_stats_you_ve_ever_seen'],
			],
			zoomPlaceholder,
		},
		title: 'Video',
	},
	'zoom-link': {
		controls: {
			...className,
			...zoom,
			alt: [undefined, 'Custom alt text'],
			src: [
				['photo', photo],
				['tiger', tiger],
				['photo pair', { dark: photoDark, light: photo }],
				['local video', '/test.mp4'],
				['YouTube ID', 'dQw4w9WgXcQ'],
			],
		},
		title: 'ZoomLink',
	},
	zoomer: {
		controls: {
			enabled: [undefined, true, false, 'gallery'],
			href: [undefined, '/test.jpeg'],
			indicator: [undefined, true, false],
			interactive: [undefined, true, false],
			level: [undefined, 'fit', 'fill', 'native'],
			nativeWidth: [undefined, photo.width, 640],
			placeholder: [undefined, 'auto', 'none'],
			scope: [undefined, '.component-preview'],
		},
		title: 'Zoomer',
	},
} satisfies Demos

/**
 * Controls for props a component doesn't take, which the `Demos` annotation
 * misses when they arrive in a spread group.
 */
type ExtraControl = {
	[Slug in keyof Demos]: Exclude<
		keyof (typeof definitions)[Slug]['controls'],
		keyof Demos[Slug]['controls']
	>
}[keyof Demos]

export const demos: Demos & Record<ExtraControl, never> = definitions

type AnyChoice = Primitive | readonly [label: string, value: unknown]

function labelOf(choice: AnyChoice): string {
	return typeof choice === 'object' ? choice[0] : String(choice)
}

function valueOf(choice: AnyChoice): unknown {
	return typeof choice === 'object' ? choice[1] : choice
}

/** The entry a control's URL parameter names, falling back to the first. */
function pick(options: readonly AnyChoice[], search: URLSearchParams, name: string): AnyChoice {
	const label = search.get(name) ?? undefined
	return options.find((choice) => labelOf(choice) === label) ?? options[0]
}

/** Each control's option labels, with the one the URL selects. */
export function readFields(
	controls: Record<string, readonly AnyChoice[]>,
	search: URLSearchParams,
): Array<{ labels: string[]; name: string; selected: string }> {
	return Object.entries(controls).map(([name, options]) => ({
		labels: options.map((choice) => labelOf(choice)),
		name,
		selected: labelOf(pick(options, search, name)),
	}))
}

/** The props the URL selects, leaving unset ones out. */
export function readProps<Props>(demo: Demo<Props>, search: URLSearchParams): Props {
	const props: Record<string, unknown> = {}
	for (const [name, options] of Object.entries<readonly AnyChoice[]>(demo.controls)) {
		const value = valueOf(pick(options, search, name))
		if (value !== undefined) {
			props[name] = value
		}
	}

	// Every prop has a control, each of whose values its type accepts
	return props as Props
}
