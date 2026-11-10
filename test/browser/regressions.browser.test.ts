import { afterEach, expect, it, vi } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { subjectOf } from '../../src/components/internal/lightbox/dom'
import {
	closeLightbox,
	openLightbox,
	prepareLightbox,
} from '../../src/components/internal/lightbox/lightbox'
import {
	boxes,
	cleanUp,
	frames,
	item,
	mount,
	playerItem,
	query,
	setUpLightbox,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(async () => {
	await cleanUp()
	vi.restoreAllMocks()
})

function button(name: string): HTMLButtonElement {
	return query(viewer(), `.amk-lightbox-${name}`, HTMLButtonElement)
}

function image(): string {
	return '<img src="/media/tile-2400.jpg" width="2400" height="2400" alt="Tile" style="width: 100%; height: auto" />'
}

async function open(content: string): Promise<HTMLElement> {
	const fixture = mount(content)
	await Promise.all(Array.from(fixture.querySelectorAll('img'), async (each) => each.decode()))
	await openLightbox(boxes(fixture)[0]!)
	return fixture
}

function videoFixture(): HTMLElement {
	const fixture = mount(
		item(
			`<video muted loop playsinline width="1280" height="720" style="width: 100%; height: auto" aria-label="Test clip">
				<source src="/media/loop.mp4" type="video/mp4" />
				<source src="/media/loop.webm" type="video/webm" />
			</video>`,
			'style="width: 640px"',
		),
	)
	query(fixture, 'video', HTMLVideoElement).load()
	return fixture
}

/** Cache `url` in a document that is gone again, as an earlier page would. */
async function visit(url: string) {
	const frame = document.createElement('iframe')
	frame.srcdoc = `<img src="${url}" alt="">`
	const loaded = new Promise((resolve) => {
		frame.addEventListener('load', resolve, { once: true })
	})
	document.body.append(frame)
	await loaded
	frame.remove()
}

/** Whether `element` has pixels to show right now. */
function hasPixels(element: HTMLCanvasElement | HTMLImageElement): boolean {
	const context = document.createElement('canvas').getContext('2d')!
	context.drawImage(element, 0, 0, 1, 1)
	return context.getImageData(0, 0, 1, 1).data[3] === 255
}

/** Whether wheel input can scroll a plain scroller here. */
async function wheelScrolls(): Promise<boolean> {
	const fixture = mount(
		'<div style="position: fixed; inset: 0; overflow: auto"><div style="height: 200vh"></div></div>',
	)
	const scroller = query(fixture, 'div')
	await commands.mouseWheel(0, 100)
	for (let frame = 0; frame < 60 && scroller.scrollTop === 0; frame++) {
		await frames(1)
	}

	const didScroll = scroller.scrollTop > 0
	fixture.remove()
	return didScroll
}

it('keeps only one slide zoomed when zoom interrupts navigation', async () => {
	await open(
		Array.from({ length: 2 }, () =>
			item(
				image(),
				'data-gallery="race" data-level="native" data-native-width="2400" style="width: 200px"',
			),
		).join(''),
	)
	button('zoom').click()
	button('next').click()
	// Act on the very frame that B becomes active, while the glide still runs.
	while (
		viewer().querySelector('.amk-lightbox-slide:not([inert])')?.getAttribute('aria-label') !==
		'2 of 2'
	) {
		await frames(1)
	}

	button('zoom').click()
	expect(viewer().querySelectorAll('[data-zoomed]')).toHaveLength(1)
	button('previous').click()
	await expect.poll(() => viewer().querySelectorAll('[data-zoomed]').length).toBe(0)
})

it('leaves a decorative image copy while preserving the original element', async () => {
	const fixture = mount(item(image(), 'style="width: 200px"'))
	const box = boxes(fixture)[0]!
	const original = box.querySelector('img')!
	await original.decode()
	await openLightbox(box)
	const copy = box.querySelector('img')!
	await copy.decode()
	expect(copy).not.toBe(original)
	expect(copy.src).toBe(original.src)
	expect(copy.getBoundingClientRect().width).toBeCloseTo(200, 0)
	expect(copy.ariaHidden).toBe('true')
	expect(copy.inert).toBe(true)
	expect(subjectOf(box)).toBeUndefined()
	expect(box.querySelector('canvas')).toBeNull()
	expect(viewer().querySelector('img')).toBe(original)
	viewer().close()
	await frames()
	expect(copy.isConnected).toBe(false)
	expect(subjectOf(box)).toBe(original)
})

it('keeps loaded thumbnails drawable on every frame when neighboring pictures are lifted', async () => {
	const fixture = mount(
		`<div style="display: flex; gap: 16px">${['aurora', 'dune', 'tile']
			.map((name) =>
				item(
					`<picture>
						<source type="image/webp" sizes="auto, 1600px" srcset="/media/${name}-480.webp 480w, /media/${name}-1600.webp 1600w">
						<img src="/media/${name}-480.jpg" srcset="/media/${name}-480.jpg 480w, /media/${name}-1600.jpg 1600w" sizes="auto, 1600px" loading="lazy" decoding="async" width="2400" height="1600" style="width: 100%; height: auto" alt="${name}">
					</picture>`,
					'data-gallery="handoff" style="width: 160px"',
				),
			)
			.join('')}</div>`,
	)
	const items = boxes(fixture)
	const originals = items.map((each) => each.querySelector('img')!)
	await expect
		.poll(() => originals.every((original) => original.complete && original.naturalWidth > 0))
		.toBe(true)
	await Promise.all(originals.map(async (original) => original.decode()))
	const sources = originals.map((original) => original.currentSrc)
	const emptyFrames: number[] = []
	let isSampling = true
	const sample = () => {
		for (const [index, each] of items.entries()) {
			const thumbnail = each.querySelector('img')
			// A preview shows what it started with, or what its lifted original
			// has loaded since, with nothing it cannot draw in between
			if (
				thumbnail === null ||
				thumbnail.naturalWidth === 0 ||
				(thumbnail.currentSrc !== sources[index] &&
					thumbnail.currentSrc !== originals[index]!.currentSrc)
			) {
				emptyFrames.push(index)
			}
		}

		if (isSampling) {
			requestAnimationFrame(sample)
		}
	}

	requestAnimationFrame(sample)
	try {
		await openLightbox(items[1]!)
		await frames(3)
		expect(items.every((each) => Object.hasOwn(each.dataset, 'lifted'))).toBe(true)
		expect(emptyFrames).toEqual([])
		for (const original of originals) {
			expect(viewer().contains(original)).toBe(true)
		}
	} finally {
		isSampling = false
	}
})

const framedImage =
	'class="framed" width="2400" height="1600" alt="" style="width: 100%; height: auto; object-fit: cover; border-radius: 12px; filter: saturate(0.5)"'

it.each([
	['plain image', '.jpg', (url: string) => `<img src="${url}" ${framedImage} />`],
	[
		'picture',
		'.webp',
		(url: string) =>
			`<picture><source type="image/webp" srcset="${url}"><img src="/media/dune-480.jpg" ${framedImage} /></picture>`,
	],
] as const)(
	'keeps a %s preview drawable when a new element would wait on revalidating it',
	async (_name, extension, subject) => {
		const url = `/media/dune-480${extension}?must-revalidate=${crypto.randomUUID()}`
		await visit(url)
		const fixture = mount(
			`<style>.framed { background-color: rgb(204, 204, 204) }</style>${item(subject(url), 'style="width: 160px"')}`,
		)
		const box = boxes(fixture)[0]!
		const original = query(box, 'img', HTMLImageElement)
		await original.decode()
		const home = original.getBoundingClientRect()

		const opening = openLightbox(box)
		const preview = box.querySelector<HTMLCanvasElement | HTMLImageElement | HTMLPictureElement>(
			'[data-amk-preview]',
		)!
		const shown =
			preview instanceof HTMLPictureElement ? query(preview, 'img', HTMLImageElement) : preview
		// The state a frame is painted from, well before the server can answer
		await frames(1)
		expect(hasPixels(shown)).toBe(true)
		const drawn = preview.getBoundingClientRect()
		expect(drawn.width).toBeCloseTo(home.width, 0)
		expect(drawn.height).toBeCloseTo(home.height, 0)
		expect(getComputedStyle(shown).objectFit).toBe('cover')
		expect(getComputedStyle(shown).borderRadius).toBe('12px')
		expect(getComputedStyle(shown).filter).toBe('saturate(0.5)')
		expect(getComputedStyle(shown).backgroundColor).toBe('rgb(204, 204, 204)')
		await opening
		expect(hasPixels(shown)).toBe(true)

		viewer().close()
		await expect.poll(() => preview.isConnected).toBe(false)
		expect(box.contains(original)).toBe(true)
	},
)

it('copies canvas pixels into a bounded bitmap and releases it on return', async () => {
	const fixture = mount(
		item('<canvas width="2400" height="2400" style="width: 200px; height: 200px"></canvas>'),
	)
	const box = boxes(fixture)[0]!
	const original = box.querySelector('canvas')!
	const context = original.getContext('2d')!
	context.fillStyle = 'red'
	context.fillRect(0, 0, 2400, 2400)
	await openLightbox(box)
	const copy = box.querySelector('canvas')!
	expect(copy.width * copy.height).toBeLessThanOrEqual(1_048_576)
	const pixel = copy.getContext('2d')!.getImageData(0, 0, 1, 1, { colorSpace: 'srgb' }).data
	// Conversion through an 8-bit P3 backing store can round by a channel value.
	for (const [index, channel] of [255, 0, 0, 255].entries()) {
		expect(Math.abs(pixel[index]! - channel)).toBeLessThanOrEqual(1)
	}

	expect(viewer().querySelector('canvas')).toBe(original)
	viewer().close()
	await frames()
	expect(copy.width).toBe(0)
	expect(subjectOf(box)).toBe(original)
	expect(original.width).toBe(2400)
})

it('supports automatic and disabled placeholders without collapsing layout', async () => {
	for (const mode of ['auto', 'none']) {
		const fixture = mount(
			item('<div style="height: 100px"></div>', `data-placeholder="${mode}" style="width: 200px"`),
		)
		const box = boxes(fixture)[0]!
		const before = box.getBoundingClientRect()
		await openLightbox(box)
		expect(box.querySelectorAll('[data-amk-preview]')).toHaveLength(mode === 'none' ? 0 : 1)
		expect(box.querySelector('canvas')).toBeNull()
		expect(box.getBoundingClientRect().height).toBe(before.height)
		viewer().close()
		await frames()
	}
})

it('returns distant subjects after navigation instead of accumulating lifts', async () => {
	const fixture = await open(
		Array.from({ length: 8 }, (_value, index) =>
			item(`<div style="width: 200px; height: 100px">${index}</div>`, 'data-gallery="bounded"'),
		).join(''),
	)
	for (let i = 1; i < 8; i++) {
		button('next').click()
		await expect
			.poll(() =>
				viewer().querySelector('.amk-lightbox-slide:not([inert])')?.getAttribute('aria-label'),
			)
			.toBe(`${i + 1} of 8`)
		await expect
			.poll(() => Object.hasOwn(query(viewer(), '.amk-lightbox-track').dataset, 'moving'))
			.toBe(false)
		expect(fixture.querySelectorAll('[data-lifted]').length).toBeLessThanOrEqual(3)
	}

	expect(fixture.querySelectorAll('[data-lifted]')).toHaveLength(2)
	expect(subjectOf(boxes(fixture)[0]!)).toBeInstanceOf(HTMLElement)
})

it('hands an interrupted spring to native wheel scrolling and snapping', async () => {
	await open(
		Array.from({ length: 3 }, (_value, index) =>
			item(`<div style="width: 200px; height: 100px">${index}</div>`, 'data-gallery="wheel"'),
		).join(''),
	)
	button('next').click()
	await frames(2)
	await commands.mouseWheel(1000, 0)
	const track = query(viewer(), '.amk-lightbox-track')
	await expect.poll(() => track.scrollLeft).toBeGreaterThan(0)
	await expect.poll(() => Object.hasOwn(track.dataset, 'moving')).toBe(false)
	await expect
		.poll(() =>
			Math.abs(
				track.scrollLeft / track.clientWidth - Math.round(track.scrollLeft / track.clientWidth),
			),
		)
		.toBeLessThan(0.001)
	expect(track.style.translate).toBe('')
	expect(viewer().open).toBe(true)
})

it('settles native touch input after it interrupts a spring', async ({ skip }) => {
	await open(
		Array.from({ length: 3 }, (_value, index) =>
			item(`<div style="width: 200px; height: 100px">${index}</div>`, 'data-gallery="touch"'),
		).join(''),
	)
	button('next').click()
	await frames(2)
	if (!(await commands.touchSwipe())) {
		skip()
	}

	const track = query(viewer(), '.amk-lightbox-track')
	await expect.poll(() => Object.hasOwn(track.dataset, 'moving')).toBe(false)
	await expect
		.poll(() =>
			Math.abs(
				track.scrollLeft / track.clientWidth - Math.round(track.scrollLeft / track.clientWidth),
			),
		)
		.toBeLessThan(0.001)
	expect(track.style.translate).toBe('')
	expect(viewer().open).toBe(true)
})

it('releases mouse drag ownership when pointer capture is lost', async () => {
	await open(
		Array.from({ length: 2 }, (_value, index) =>
			item(`<div style="width: 200px; height: 100px">${index}</div>`, 'data-gallery="capture"'),
		).join(''),
	)
	const track = query(viewer(), '.amk-lightbox-track')
	let pointerId = 0
	track.addEventListener(
		'pointerdown',
		(event) => {
			pointerId = event.pointerId
		},
		{ once: true },
	)
	try {
		await commands.mouseDown(640, 400)
		await commands.mouseMove(800, 400)
		track.releasePointerCapture(pointerId)
		await commands.mouseMove(810, 400)
		await expect.poll(() => Object.hasOwn(track.dataset, 'dragging')).toBe(false)
		await expect.poll(() => Object.hasOwn(track.dataset, 'moving')).toBe(false)
		expect(track.style.translate).toBe('')
	} finally {
		await commands.mouseUp()
	}
})

it.for(['down', 'up'] as const)(
	'dismisses images with a native %s touch gesture',
	async (direction, { skip }) => {
		const fixture = await open(item(image(), 'style="width: 200px"'))
		if (!(await commands.touchSwipe(direction))) {
			skip()
		}

		await expect.poll(() => viewer().open).toBe(false)
		expect(fixture.querySelector('[data-lifted]')).toBeNull()
	},
)

it.for([
	{ content: image(), name: 'image' },
	{ content: '<div style="height: 100px; background: teal"></div>', name: 'card' },
])('rubber-bands a lone $name under a sideways touch swipe', async ({ content }, { skip }) => {
	await open(item(content, 'style="width: 200px"'))
	const track = query(viewer(), '.amk-lightbox-track')
	let most = 0
	const observer = new MutationObserver(() => {
		most = Math.max(most, Math.abs(track.getBoundingClientRect().x))
	})
	observer.observe(track, { attributeFilter: ['style'], attributes: true })
	try {
		if (!(await commands.touchSwipe())) {
			skip()
		}
	} finally {
		observer.disconnect()
	}

	expect(most).toBeGreaterThan(50)
	await expect.poll(() => track.getBoundingClientRect().x).toBe(0)
	expect(viewer().open).toBe(true)
	expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)
})

it('dismisses ordinary HTML with a native touch gesture', async ({ skip }) => {
	const fixture = await open(
		item('<div style="height: 100px; background: teal"></div>', 'style="width: 200px"'),
	)
	if (!(await commands.touchSwipe('down'))) {
		skip()
	}

	await expect.poll(() => viewer().open).toBe(false)
	expect(fixture.querySelector('[data-lifted]')).toBeNull()
})

it('takes the first click after a touch gesture dismisses the viewer', async ({ skip }) => {
	const fixture = await open(
		`${item(image(), 'style="width: 200px"')}<button type="button">Plain</button>`,
	)
	if (!(await commands.touchSwipe('down'))) {
		skip()
	}

	await expect.poll(() => viewer().open).toBe(false)
	// A touch drag ends without a click, so none is left to let be
	const plain = query(fixture, 'button')
	let clicks = 0
	plain.addEventListener('click', () => {
		clicks++
	})
	await userEvent.click(plain)
	expect(clicks).toBe(1)
})

it('keeps horizontal touch scrolling native on dismissible images', async ({ skip }) => {
	await open(
		Array.from({ length: 3 }, () =>
			item(image(), 'data-gallery="touch-images" style="width: 200px"'),
		).join(''),
	)
	if (!(await commands.touchSwipe())) {
		skip()
	}

	await expect
		.poll(() =>
			viewer().querySelector('.amk-lightbox-slide:not([inert])')?.getAttribute('aria-label'),
		)
		.toBe('2 of 3')
	expect(viewer().open).toBe(true)
	expect(Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)
})

it('fades the lifted layer in on opening and out on closing, keeping it opaque through secondary zoom', async () => {
	const fixture = mount(item(image(), 'data-level="fill" style="width: 200px"'))
	await fixture.querySelector('img')!.decode()
	const opening = openLightbox(boxes(fixture)[0]!)
	const layer = query(viewer(), '.amk-lightbox-layer')
	expect(getComputedStyle(layer).opacity).toBe('0')
	await opening
	expect(getComputedStyle(layer).opacity).toBe('1')
	button('zoom').click()
	await frames(2)
	expect(getComputedStyle(layer).opacity).toBe('1')
	viewer().requestClose()
	await expect.poll(() => Number(getComputedStyle(layer).opacity)).toBeLessThan(1)
	await expect.poll(() => viewer().open).toBe(false)
})

it('restores absent sizing attributes and preserves author edits made during preparation', async () => {
	await commands.mouseMove(1200, 760)
	const fixture = mount(
		item(
			`<picture><source type="image/webp" srcset="/media/tile-480.webp">${image()}</picture>`,
			'style="width: 160px"',
		),
	)
	const box = boxes(fixture)[0]!
	const target = fixture.querySelector('img')!
	const source = fixture.querySelector('source')!
	prepareLightbox(box)
	await openLightbox(box)
	expect(source.hasAttribute('sizes')).toBe(true)
	target.sizes = '75vw'
	target.decoding = 'sync'
	viewer().close()
	await expect.poll(() => source.hasAttribute('sizes')).toBe(false)
	expect(target.sizes).toBe('75vw')
	expect(target.decoding).toBe('sync')
	expect(target.hasAttribute('loading')).toBe(false)
})

it('opens immediately when preparation encounters a failed image', async () => {
	const fixture = mount(
		item(
			'<img src="/media/missing-review-image.jpg" width="1200" height="800" alt="Unavailable">',
			'style="width: 160px"',
		),
	)
	const box = boxes(fixture)[0]!
	prepareLightbox(box)
	await openLightbox(box)
	expect(viewer().open).toBe(true)
	viewer().close()
	await frames()
	expect(fixture.querySelector('img')!.hasAttribute('sizes')).toBe(false)
})

it('keeps a warm-up going when intent repeats, rather than starting over', async () => {
	await commands.mouseMove(1200, 760)
	const fixture = mount(
		item(
			`<img src="/media/tile-480.jpg" alt="" sizes="240px" width="2400" height="2400"
				srcset="/media/tile-480.jpg 480w, /media/tile-960.jpg 960w, /media/tile-2400.jpg 2400w"
				style="width: 100%; height: auto" />`,
			'style="width: 240px"',
		),
	)
	const box = boxes(fixture)[0]!
	await query(fixture, 'img', HTMLImageElement).decode()
	const created = vi.spyOn(document, 'createElement')
	const decode = vi.spyOn(HTMLImageElement.prototype, 'decode')

	prepareLightbox(box)
	prepareLightbox(box)
	await expect.poll(() => decode.mock.contexts.length).toBeGreaterThan(0)
	await new Promise((resolve) => {
		setTimeout(resolve, 100)
	})

	expect(created.mock.calls.filter(([tag]) => tag === 'picture')).toHaveLength(1)
	expect(new Set(decode.mock.contexts).size).toBe(1)
	expect(decode.mock.contexts[0]).not.toBe(query(fixture, 'img'))
})

it('keeps inner content scrolling natively and contains wheel input at its boundary', async ({
	skip,
}) => {
	if (!(await wheelScrolls())) {
		skip('Wheel input does not scroll even a plain scroller in this browser')
	}

	const fixture = mount(`<div style="height: 200vh"></div>
		${item(
			'<div class="scroll-content" style="width: 400px; height: 300px; overflow: auto"><div style="height: 4000px">Scrollable content</div></div>',
		)}
		<div style="height: 200vh"></div>`)
	const box = boxes(fixture)[0]!
	const content = query(fixture, '.scroll-content')
	box.scrollIntoView({ block: 'center' })
	const position = window.scrollY
	await openLightbox(box)
	await commands.mouseWheel(0, 300)
	await expect.poll(() => content.scrollTop).toBeGreaterThan(0)
	expect(window.scrollY).toBe(position)
	content.scrollTop = content.scrollHeight
	await frames()
	await commands.mouseWheel(0, 500)
	await frames(12)
	expect(window.scrollY).toBe(position)
})

it('mirrors live video frames, follows paused seeks, and releases rendering on return', async () => {
	const fixture = videoFixture()
	const video = fixture.querySelector('video')!
	await video.play()
	await expect.poll(() => video.currentTime).toBeGreaterThan(0.1)
	await openLightbox(boxes(fixture)[0]!)
	const canvas = fixture.querySelector('canvas')!
	const context = canvas.getContext('2d')!
	const draw = vi.spyOn(context, 'drawImage')
	expect(canvas.width).toBe(Math.ceil(640 * devicePixelRatio))
	expect(canvas.height).toBe(Math.ceil(360 * devicePixelRatio))
	expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(255)
	expect(viewer().querySelector('video')).toBe(video)
	expect(document.querySelectorAll('video')).toHaveLength(1)
	await expect.poll(() => draw.mock.calls.length).toBeGreaterThan(1)
	video.pause()
	await frames()
	const pausedCount = draw.mock.calls.length
	await frames(8)
	expect(draw).toHaveBeenCalledTimes(pausedCount)
	video.currentTime += 1
	await expect.poll(() => draw.mock.calls.length).toBeGreaterThan(pausedCount)
	const seekedTo = video.currentTime
	// With Ubuntu 26.04's GStreamer, WebKit stays at HAVE_CURRENT_DATA while it
	// plays, so a resumed play() never fires `playing` or settles. Wait for the
	// playback itself, and expect only the AbortError that removing the video
	// at clean-up gives the promise left pending.
	void video.play().catch((error: unknown) => {
		if (!(error instanceof DOMException) || error.name !== 'AbortError') {
			throw error
		}
	})
	await expect.poll(() => video.currentTime).toBeGreaterThan(seekedTo)
	const resumedCount = draw.mock.calls.length
	await expect.poll(() => draw.mock.calls.length).toBeGreaterThan(resumedCount)
	viewer().close()
	await frames()
	const closedCount = draw.mock.calls.length
	await frames(8)
	expect(draw).toHaveBeenCalledTimes(closedCount)
	expect(canvas.width).toBe(0)
	expect(canvas.height).toBe(0)
	expect(video.paused).toBe(false)
	expect(fixture.querySelector('video')).toBe(video)
})

it('preserves an off-center video crop in the preview and after animated dismissal', async () => {
	const fixture = videoFixture()
	const box = boxes(fixture)[0]!
	const video = fixture.querySelector('video')!
	box.style.width = '200px'
	box.style.height = '200px'
	Object.assign(video.style, {
		borderRadius: '12px',
		height: '100%',
		objectFit: 'cover',
		objectPosition: '75% 50%',
	})
	await video.play()
	await expect.poll(() => video.currentTime).toBeGreaterThan(0.1)
	const home = video.getBoundingClientRect()
	await openLightbox(box)
	const canvas = box.querySelector('canvas')!
	const preview = canvas.getBoundingClientRect()
	const style = getComputedStyle(canvas)
	expect(preview.x).toBeCloseTo(home.x, 0)
	expect(preview.y).toBeCloseTo(home.y, 0)
	expect(preview.width).toBe(home.width)
	expect(preview.height).toBe(home.height)
	expect(style.objectFit).toBe('cover')
	expect(style.objectPosition).toBe('75% 50%')
	expect(style.borderRadius).toBe('12px')
	// The bitmap contains the full frame; CSS applies the page's original crop.
	expect(canvas.width / canvas.height).toBeCloseTo(video.videoWidth / video.videoHeight, 1)
	const expanded = video.getBoundingClientRect()
	expect(expanded.width / expanded.height).toBeCloseTo(video.videoWidth / video.videoHeight, 2)
	const draw = vi.spyOn(canvas.getContext('2d')!, 'drawImage')
	await expect.poll(() => draw.mock.calls.length).toBeGreaterThan(1)
	viewer().requestClose()
	await expect.poll(() => viewer().open).toBe(false)
	await frames()
	expect(box.querySelector('video')).toBe(video)
	expect(video.paused).toBe(false)
	expect(video.getBoundingClientRect().width).toBe(home.width)
	expect(video.getBoundingClientRect().height).toBe(home.height)
	expect(getComputedStyle(video).objectPosition).toBe('75% 50%')
	expect(canvas.isConnected).toBe(false)
})

it('preserves wide-gamut bitmap colors when the display and canvas support P3', async ({
	skip,
}) => {
	const fixture = mount(item('<canvas width="20" height="20"></canvas>'))
	const box = boxes(fixture)[0]!
	const source = box.querySelector('canvas')!.getContext('2d', { colorSpace: 'display-p3' })!
	if (source.getContextAttributes().colorSpace !== 'display-p3') {
		skip()
	}

	const match = matchMedia.bind(globalThis)
	vi.spyOn(globalThis, 'matchMedia').mockImplementation((media) => {
		const result = match(media)
		if (media === '(color-gamut: p3)') {
			Object.defineProperty(result, 'matches', { value: true })
		}

		return result
	})
	source.fillStyle = 'color(display-p3 0 1 0)'
	source.fillRect(0, 0, 20, 20)
	await openLightbox(box)
	const copy = box.querySelector('canvas')!.getContext('2d')!
	const originalPixel = source.getImageData(0, 0, 1, 1, { colorSpace: 'display-p3' }).data
	const copiedPixel = copy.getImageData(0, 0, 1, 1, { colorSpace: 'display-p3' }).data
	expect([...copiedPixel]).toEqual([...originalPixel])
	expect(copy.getContextAttributes().colorSpace).toBe('display-p3')
})

it('suspends live placeholders outside the viewport and in a hidden document', async () => {
	const fixture = videoFixture()
	await fixture.querySelector('video')!.play()
	await openLightbox(boxes(fixture)[0]!)
	const context = fixture.querySelector('canvas')!.getContext('2d')!
	const draw = vi.spyOn(context, 'drawImage')
	await expect.poll(() => draw.mock.calls.length).toBeGreaterThan(1)
	fixture.style.transform = 'translateY(200vh)'
	await frames(4)
	const offscreenCount = draw.mock.calls.length
	await frames(8)
	expect(draw).toHaveBeenCalledTimes(offscreenCount)
	fixture.style.transform = ''
	await expect.poll(() => draw.mock.calls.length).toBeGreaterThan(offscreenCount)
	const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
	document.dispatchEvent(new Event('visibilitychange'))
	const hiddenCount = draw.mock.calls.length
	await frames(8)
	expect(draw).toHaveBeenCalledTimes(hiddenCount)
	hidden.mockRestore()
	document.dispatchEvent(new Event('visibilitychange'))
	await expect.poll(() => draw.mock.calls.length).toBeGreaterThan(hiddenCount)
})

it('starts a live placeholder when video data arrives after lifting', async () => {
	const fixture = await open(
		item(
			'<video muted playsinline width="1280" height="720" style="width: 100%; height: auto"></video>',
			'style="width: 200px"',
		),
	)
	const canvas = fixture.querySelector('canvas')!
	expect(canvas.width).toBe(1)
	const video = viewer().querySelector('video')!
	// Match the MP4-first fallback used by the other native video fixtures.
	video.src = video.canPlayType('video/mp4') === '' ? '/media/loop.webm' : '/media/loop.mp4'
	video.load()
	await video.play()
	await expect.poll(() => canvas.width).toBeGreaterThan(1)
	expect(canvas.width).toBe(Math.ceil(200 * devicePixelRatio))
	await expect.poll(() => canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data[3]).toBe(255)
})

it('falls back to a static video snapshot when frame callbacks are unavailable', async () => {
	vi.spyOn(globalThis, 'devicePixelRatio', 'get').mockReturnValue(2)
	const fixture = videoFixture()
	const video = fixture.querySelector('video')!
	await video.play()
	await expect.poll(() => video.currentTime).toBeGreaterThan(0.1)
	Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined })
	await openLightbox(boxes(fixture)[0]!)
	const canvas = fixture.querySelector('canvas')!
	const context = canvas.getContext('2d')!
	const draw = vi.spyOn(context, 'drawImage')
	expect(canvas.width).toBe(1280)
	expect(canvas.height).toBe(720)
	expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(255)
	await frames(8)
	expect(draw).not.toHaveBeenCalled()
	expect(video.paused).toBe(false)
})

it.each([
	['fill', 200, 2, 400, 400],
	['contain', 200, 2, 400, 225],
	['cover', 200, 2, 712, 400],
	['scale-down', 200, 2, 400, 225],
	['none', 200, 2, 1280, 720],
	['none', 200, 0.75, 1280, 720],
	['scale-down', 200, 0.75, 200, 113],
	['scale-down', 800, 2, 1280, 720],
] as const)(
	'matches video density for object-fit: %s at %ipx and %fx',
	async (fit, size, density, width, height) => {
		vi.spyOn(globalThis, 'devicePixelRatio', 'get').mockReturnValue(density)
		const fixture = videoFixture()
		const box = boxes(fixture)[0]!
		const video = fixture.querySelector('video')!
		Object.assign(box.style, { width: `${size}px`, height: `${size}px` })
		Object.assign(video.style, { height: '100%', objectFit: fit })
		await video.play()
		await expect.poll(() => video.currentTime).toBeGreaterThan(0.1)
		video.pause()
		await openLightbox(box)
		const canvas = box.querySelector('canvas')!
		expect(canvas.width).toBe(width)
		expect(canvas.height).toBe(height)
		expect(canvas.getBoundingClientRect().width).toBe(size)
		expect(canvas.getBoundingClientRect().height).toBe(size)
	},
)

it('updates a paused video preview when display density changes', async () => {
	const density = vi.spyOn(globalThis, 'devicePixelRatio', 'get').mockReturnValue(2)
	const fixture = videoFixture()
	const video = fixture.querySelector('video')!
	await video.play()
	await expect.poll(() => video.currentTime).toBeGreaterThan(0.1)
	video.pause()
	await openLightbox(boxes(fixture)[0]!)
	const canvas = fixture.querySelector('canvas')!
	expect(canvas.width).toBe(1280)
	expect(canvas.height).toBe(720)
	density.mockReturnValue(3)
	dispatchEvent(new Event('resize'))
	await expect.poll(() => canvas.width).toBe(1920)
	expect(canvas.height).toBe(1080)
	expect(video.paused).toBe(true)
})

it('preserves picture markup and the displayed source in a prepared preview', async () => {
	const fixture = mount(
		`<figure>${item(
			`<picture>
			<source type="image/webp" sizes="auto, 160px" srcset="/media/aurora-480.webp 480w, /media/aurora-1600.webp 1600w">
			<img src="/media/aurora-480.jpg" sizes="auto, 160px" loading="lazy" width="2400" height="1600" style="width: 100%; height: auto" alt="Aurora">
		</picture>`,
			'style="width: 160px"',
		)}<figcaption>Original caption</figcaption></figure>`,
	)
	const box = boxes(fixture)[0]!
	const original = box.querySelector('picture')!
	const caption = fixture.querySelector('figcaption')!
	await expect.poll(() => original.querySelector('img')!.naturalWidth).toBeGreaterThan(0)
	const source = original.querySelector('img')!.currentSrc
	prepareLightbox(box)
	await openLightbox(box)
	const copy = box.querySelector('picture')!
	expect(copy).not.toBe(original)
	// The copy shows the displayed source, then follows the lifted original to
	// the larger candidate it loads
	const displayed = () => original.querySelector('img')!.currentSrc
	expect([source, displayed()]).toContain(copy.querySelector('source')!.srcset)
	await expect.poll(() => copy.querySelector('source')!.srcset === displayed()).toBe(true)
	await expect.poll(() => copy.querySelector('img')!.src === displayed()).toBe(true)
	expect(copy.querySelector('source')!.sizes).toBe('auto, 160px')
	expect(copy.querySelector('img')!.sizes).toBe('auto, 160px')
	expect(copy.querySelector('img')!.loading).toBe('eager')
	expect(original.querySelector('source')!.sizes).not.toBe('auto, 160px')
	expect(copy.querySelector('img')!.getBoundingClientRect().width).toBeCloseTo(160, 0)
	expect(viewer().querySelector('picture')).toBe(original)
	expect(caption.parentElement).toBe(fixture.querySelector('figure'))
	expect(getComputedStyle(caption).visibility).toBe('visible')
	expect(query(viewer(), '.amk-lightbox-caption').textContent).toBe(caption.textContent)
})

it('preserves ordinary markup styling and remaps preview references without copying behavior', async () => {
	const fixture = mount(
		item(
			`<div id="preview-card" aria-labelledby="preview-title" style="display: flex; padding: 12px; border: 3px solid red; gap: 8px; background: blue">
				<strong id="preview-title">A card</strong><a href="#preview-title" onclick="void 0" onfocus="void 0">Title</a>
				<svg width="32" height="32"><defs><clipPath id="preview-clip"><rect width="32" height="32" /></clipPath></defs><rect width="32" height="32" clip-path="url(#preview-clip)" /></svg>
			</div>`,
			'style="width: 240px"',
		),
	)
	const box = boxes(fixture)[0]!
	const original = box.querySelector('div')!
	const before = original.getBoundingClientRect()
	await openLightbox(box)
	const copy = query(box, '[data-amk-preview]')
	expect(copy.textContent).toBe(original.textContent)
	expect(copy.id).not.toBe(original.id)
	// eslint-disable-next-line unicorn/no-incorrect-query-selector -- Count every match to detect duplicate IDs.
	expect(document.querySelectorAll('#preview-title')).toHaveLength(1)
	expect(copy.getAttribute('aria-labelledby')).toBe(copy.querySelector('strong')!.id)
	expect(copy.querySelector('a')!.getAttribute('href')).toBe(`#${copy.querySelector('strong')!.id}`)
	expect(copy.querySelector('a')!.hasAttribute('onclick')).toBe(false)
	expect(copy.querySelector('a')!.hasAttribute('onfocus')).toBe(false)
	expect(copy.querySelector('[clip-path]')!.getAttribute('clip-path')).toBe(
		`url(#${copy.querySelector('clipPath')!.id})`,
	)
	expect(getComputedStyle(copy).display).toBe('flex')
	expect(getComputedStyle(copy).paddingLeft).toBe('12px')
	expect(getComputedStyle(copy).borderLeftWidth).toBe('3px')
	expect(copy.getBoundingClientRect().width).toBeCloseTo(before.width, 0)
	expect(copy.getBoundingClientRect().height).toBeCloseTo(before.height, 0)
})

it('does not initialize a second custom component for a placeholder', async () => {
	let constructions = 0
	const name = `preview-widget-${crypto.randomUUID()}`
	customElements.define(
		name,
		class extends HTMLElement {
			constructor() {
				super()
				constructions++
			}
		},
	)
	const fixture = mount(
		playerItem(`<div style="width: 200px; height: 100px"><${name}></${name}></div>`),
	)
	const box = boxes(fixture)[0]!
	await openLightbox(box)
	expect(constructions).toBe(1)
	expect(box.querySelector('[data-amk-preview]')).toBeNull()
	expect(box.getBoundingClientRect().height).toBe(100)
})

it('disables previews for every supported content type while preserving captions and space', async () => {
	for (const content of [
		image(),
		`<picture>${image()}</picture>`,
		'<video width="200" height="100"></video>',
		'<canvas width="200" height="100"></canvas>',
		'<div style="height: 100px">Card</div>',
	]) {
		const fixture = mount(
			`<figure>${item(content, 'data-placeholder="none" style="width: 200px"')}<figcaption>Caption stays</figcaption></figure>`,
		)
		const box = boxes(fixture)[0]!
		await Promise.all(Array.from(box.querySelectorAll('img'), async (target) => target.decode()))
		const before = box.getBoundingClientRect()
		await openLightbox(box)
		expect(box.querySelector('[data-amk-preview]')).toBeNull()
		expect(box.getBoundingClientRect().height).toBeCloseTo(before.height, 0)
		expect(getComputedStyle(fixture.querySelector('figcaption')!).visibility).toBe('visible')
		viewer().close()
		await frames()
	}
})

it('closes immediately before a page swap, and reopens on the next page', async () => {
	const fixture = mount(item(image(), 'style="width: 200px"'))
	const box = boxes(fixture)[0]!
	const original = box.firstElementChild
	await openLightbox(box)
	await closeLightbox(true)
	expect(box.firstElementChild).toBe(original)
	expect(viewer().open).toBe(false)
	await openLightbox(box)
	expect(viewer().open).toBe(true)
})

it('stands a poster in for an embedded player with nothing to draw, started or not', async () => {
	const fixture = mount(
		playerItem(
			`<div class="amk" style="width: 240px">
				<video-player poster="/media/loop-poster.jpg">
					<media-container data-media="" style="display: block; width: 240px; aspect-ratio: 16 / 9; background: #000">
						<vimeo-video class="amk-media"></vimeo-video>
						<media-poster class="amk-poster"></media-poster>
					</media-container>
				</video-player>
			</div>`,
		),
	)
	const box = boxes(fixture)[0]!
	const container = query(box, 'media-container').getBoundingClientRect()
	await openLightbox(box)
	const preview = query(box, '[data-amk-preview]', HTMLImageElement)
	expect(preview.src).toContain('/media/loop-poster.jpg')
	expect(preview.getBoundingClientRect().width).toBeCloseTo(container.width, 0)
	expect(preview.getBoundingClientRect().height).toBeCloseTo(container.height, 0)
})
