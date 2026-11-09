import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import {
	closeLightbox,
	openLightbox,
	prepareLightbox,
} from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	boxes,
	cleanUp,
	currentLayer,
	frames,
	item,
	liftDone,
	mount,
	query,
	setUpLightbox,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

async function fixture({ automatic = false, failure = false, picture = false } = {}) {
	const token = crypto.randomUUID()
	const small = `/media/aurora-480.webp?${token}`
	const large = `/media/aurora-1600.webp?cold-image=${token}${failure ? '&failed-image' : ''}`
	const candidates = `${small} 480w, ${large} 1600w`
	const image = `<img alt="Aurora" src="${small}" srcset="${candidates}" sizes="${automatic ? 'auto, 160px' : '160px'}" ${automatic ? 'loading="lazy"' : ''} width="2400" height="1600" style="width:100%;height:auto">`
	const content = picture
		? `<picture><source type="image/webp" srcset="${candidates}" sizes="160px">${image}</picture>`
		: image
	const root = mount(
		item(content, 'data-level="native" data-native-width="2400" style="width:160px"'),
	)
	const box = boxes(root)[0]!
	const original = query(box, 'img', HTMLImageElement)
	await expect.poll(() => original.complete && original.naturalWidth > 0).toBe(true)
	await original.decode()
	expect(original.currentSrc).toContain('-480.')
	return { box, original }
}

function preview(): HTMLCanvasElement | HTMLImageElement {
	const element = query(viewer(), '.amk-lightbox-image-preview')
	if (!(element instanceof HTMLCanvasElement) && !(element instanceof HTMLImageElement)) {
		throw new TypeError('Expected an image or canvas preview')
	}

	return element
}

function expectVisibleBitmap(minimumWidth = 480) {
	const bitmap = preview()
	expect(bitmap.width * bitmap.height).toBeGreaterThan(0)
	if (bitmap instanceof HTMLCanvasElement) {
		expect(bitmap.width * bitmap.height).toBeLessThanOrEqual(1_050_000)
	}

	// The 160px thumbnail already has a 480px source; keep its available detail.
	expect(
		bitmap instanceof HTMLImageElement ? bitmap.naturalWidth : bitmap.width,
	).toBeGreaterThanOrEqual(minimumWidth)
	const context = document.createElement('canvas').getContext('2d')!
	context.drawImage(bitmap, 0, 0, 1, 1)
	expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(255)
	expect(bitmap.getBoundingClientRect().width).toBeGreaterThan(160)
	expect(getComputedStyle(bitmap).opacity).toBe('1')
	expect(bitmap.inert).toBe(true)
	expect(bitmap.ariaHidden).toBe('true')
}

/** Model a browser requiring a new response for every newly created image. */
function requireImageRevalidation() {
	const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete')!
	return vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockImplementation(function (
		this: HTMLImageElement,
	) {
		return this.isConnected && descriptor.get!.call(this) === true
	})
}

async function responsiveFixture(picture: boolean) {
	const token = crypto.randomUUID()
	const source = (width: number) => `/media/tile-${width}.jpg?${token}`
	const candidates = [480, 960, 2400].map((width) => `${source(width)} ${width}w`).join(', ')
	const image = `<img alt="Tile" src="${source(480)}" srcset="${candidates}" sizes="auto, 160px" loading="lazy" width="2400" height="2400" style="width:100%;height:auto">`
	const content = picture
		? `<picture><source type="image/jpeg" srcset="${candidates}" sizes="160px">${image}</picture>`
		: image
	const root = mount(
		item(content, 'data-level="native" data-native-width="2400" style="width:160px"'),
	)
	const box = boxes(root)[0]!
	const original = query(box, 'img', HTMLImageElement)
	await expect.poll(() => original.complete && original.naturalWidth > 0).toBe(true)
	return { box, original }
}

it.each([false, true])(
	'preloads the next slide and navigates while its decode is pending (picture=%s)',
	async (picture) => {
		const current = await fixture({ automatic: true, picture })
		const next = await fixture({ automatic: true, picture })
		current.box.dataset.gallery = 'image-upgrade'
		next.box.dataset.gallery = 'image-upgrade'
		const thumbnail = next.original.currentSrc
		const decoding = Promise.withResolvers<undefined>()
		const decodeImage = next.original.decode.bind(next.original)
		const decode = vi.spyOn(next.original, 'decode').mockImplementation(async () => {
			await decoding.promise
			await decodeImage()
		})
		const draw = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage')

		try {
			await openLightbox(current.box)
			await expect.poll(() => decode.mock.calls.length).toBeGreaterThan(0)
			expect(next.original.decoding).toBe('async')
			expect(next.original.loading).toBe('eager')
			expect(activeSlideLabel()).toBe('1 of 2')
			const copy = query(next.box, 'img', HTMLImageElement)
			// Even after the bytes arrive, the page copy must keep its decoded
			// thumbnail instead of forcing a synchronous decode of the replacement.
			await expect.poll(() => next.original.currentSrc).toContain('-1600.')
			expect(copy.currentSrc).toBe(thumbnail)
			expect(copy.decoding).toBe('sync')

			query(viewer(), '.amk-lightbox-next').click()
			await expect.poll(activeSlideLabel).toBe('2 of 2')
			const track = query(viewer(), '.amk-lightbox-track')
			await expect.poll(() => Object.hasOwn(track.dataset, 'moving')).toBe(false)
			const bitmap = query(currentLayer(), '.amk-lightbox-image-preview', HTMLImageElement)
			expect(getComputedStyle(bitmap).opacity).toBe('1')
			expect(getComputedStyle(next.original).opacity).toBe('0')
			// The picture's larger source must not take over the retained image,
			// or force its pixels through Chromium's separate canvas decode cache.
			expect(bitmap.currentSrc).toBe(thumbnail)
			expect(draw.mock.calls.some(([source]) => source === next.original)).toBe(false)

			decoding.resolve(undefined)
			await expect.poll(() => bitmap.isConnected).toBe(false)
			await expect.poll(() => copy.currentSrc).toBe(next.original.currentSrc)
			expect(copy.decoding).toBe('async')
			expect(getComputedStyle(next.original).opacity).toBe('1')
		} finally {
			decoding.resolve(undefined)
			decode.mockRestore()
			draw.mockRestore()
		}
	},
)

it.each([false, true])(
	'loads the native candidate when a touch click zooms a warmed image (picture=%s)',
	async (picture) => {
		const { box, original } = await responsiveFixture(picture)
		box.focus()
		await openLightbox(box)
		await expect.poll(() => original.currentSrc).toContain('-960.jpg')
		const layer = currentLayer()
		const bounds = layer.getBoundingClientRect()
		layer.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' }))
		// Touch opens without the mouse hover that prepares a native candidate.
		layer.dispatchEvent(
			new MouseEvent('click', {
				bubbles: true,
				clientX: bounds.x + bounds.width / 2,
				clientY: bounds.y + bounds.height / 2,
				detail: 1,
			}),
		)
		await liftDone()
		expect(layer.getBoundingClientRect().width).toBeCloseTo(2400, 0)
		await expect.poll(() => original.currentSrc).toContain('-2400.jpg')
		await closeLightbox()
		expect(original.sizes).toBe('auto, 160px')
	},
)

it('waits for decoding before capturing an image with no loaded thumbnail', async () => {
	const root = mount(
		item(
			`<img src="/media/aurora-1600.webp?cold-image=${crypto.randomUUID()}" decoding="async" alt="Aurora" width="2400" height="1600" style="width:100%;height:auto">`,
			'style="width:160px"',
		),
	)
	const original = query(root, 'img', HTMLImageElement)
	const decoding = Promise.withResolvers<undefined>()
	const decodeImage = original.decode.bind(original)
	const decode = vi.spyOn(original, 'decode').mockImplementation(async () => {
		await decoding.promise
		await decodeImage()
	})
	const draw = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage')
	const captures = () => draw.mock.calls.filter(([source]) => source === original).length
	const revalidation = requireImageRevalidation()
	try {
		await openLightbox(boxes(root)[0]!)
		await expect.poll(() => original.complete && original.naturalWidth > 0).toBe(true)
		await frames()
		expect(captures()).toBe(0)
		decoding.resolve(undefined)
		await expect.poll(captures).toBeGreaterThan(0)
	} finally {
		decoding.resolve(undefined)
		decode.mockRestore()
		draw.mockRestore()
		revalidation.mockRestore()
	}
})

it.each([false, true])(
	'loads a larger fitted candidate after the warmed viewport enlarges (picture=%s)',
	async (picture) => {
		const { box, original } = await responsiveFixture(picture)
		prepareLightbox(box)
		await openLightbox(box)
		await expect.poll(() => original.currentSrc).toContain('-960.jpg')
		try {
			await page.viewport(2000, 1400)
			await expect.poll(() => currentLayer().getBoundingClientRect().width).toBeGreaterThan(960)
			await expect.poll(() => original.currentSrc).toContain('-2400.jpg')
		} finally {
			await closeLightbox()
			await page.viewport(1280, 800)
		}
	},
)

it.each([false, true])(
	'zooms the loaded bitmap until an uncached candidate decodes (picture=%s)',
	async (picture) => {
		const { box, original } = await fixture({ picture })
		prepareLightbox(box)
		await openLightbox(box)
		expectVisibleBitmap()
		expect(getComputedStyle(original).opacity).toBe('0')
		const bitmap = preview()
		await expect.poll(() => original.complete && original.currentSrc.includes('-1600.')).toBe(true)
		await expect.poll(() => bitmap.isConnected).toBe(false)
		expect(getComputedStyle(original).opacity).toBe('1')
		expect(viewer().contains(original)).toBe(true)
		await closeLightbox()
		expect(box.contains(original)).toBe(true)
		expect(bitmap.width).toBe(0)
	},
)

it('keeps the last good image when the larger request fails', async () => {
	const { box, original } = await fixture({ failure: true, picture: true })
	const failed = new Promise((resolve) => {
		original.addEventListener('error', resolve, { once: true })
	})
	prepareLightbox(box)
	await openLightbox(box)
	await failed
	await frames()
	expectVisibleBitmap()
	expect(getComputedStyle(original).opacity).toBe('0')
	await closeLightbox()
	await expect.poll(() => Object.hasOwn(original.dataset, 'zoomImagePending')).toBe(false)
})

it('retains bounded canvas pixels when a thumbnail cannot be reused from cache', async () => {
	const { box, original } = await fixture({ picture: true })
	const revalidation = requireImageRevalidation()
	try {
		await openLightbox(box)
		const bitmap = query(viewer(), '.amk-lightbox-image-preview', HTMLCanvasElement)
		expectVisibleBitmap()
		expect(getComputedStyle(original).opacity).toBe('0')
		await expect.poll(() => bitmap.isConnected).toBe(false)
		expect(bitmap.width).toBe(0)
		expect(getComputedStyle(original).opacity).toBe('1')
	} finally {
		revalidation.mockRestore()
	}
})

it('preserves translucent styling without a page placeholder or doubled painting', async () => {
	const { box, original } = await fixture({ picture: true })
	box.dataset.placeholder = 'none'
	Object.assign(original.style, {
		backgroundColor: 'rgba(20, 20, 20, 0.5)',
		borderRadius: '12px',
		filter: 'grayscale(1)',
		opacity: '0.4',
	})
	prepareLightbox(box)
	await openLightbox(box)
	const bitmap = preview()
	const style = getComputedStyle(bitmap)
	expect(style.opacity).toBe('0.4')
	expect(style.backgroundColor).toBe('rgba(20, 20, 20, 0.5)')
	expect(style.filter).toBe('grayscale(1)')
	expect(style.borderRadius).toBe('12px')
	expect(getComputedStyle(original).opacity).toBe('0')
	expect(box.querySelector('[data-preview]')).toBeNull()
	await expect.poll(() => bitmap.isConnected).toBe(false)
	expect(getComputedStyle(original).opacity).toBe('0.4')
})

it('keeps the retained bitmap visible when a selector theme changes during loading', async () => {
	const { box, original } = await fixture({ picture: true })
	const light = query(box, 'picture', HTMLPictureElement)
	const dark = light.cloneNode(true) as HTMLPictureElement
	light.className = 'upgrade-light'
	dark.className = 'upgrade-dark'
	const darkImage = query(dark, 'img', HTMLImageElement)
	original.dataset.media = ''
	darkImage.dataset.media = ''
	const subject = document.createElement('div')
	subject.className = 'amk-picture'
	light.replaceWith(subject)
	subject.append(light, dark)
	mount(
		'<style>:root:not([data-image-test-dark]) .upgrade-dark, :root[data-image-test-dark] .upgrade-light { display: none }</style>',
	)
	darkImage.sizes = '1600px'
	query(dark, 'source', HTMLSourceElement).sizes = '1600px'
	prepareLightbox(box)
	await openLightbox(box)
	document.documentElement.dataset.imageTestDark = ''
	try {
		await frames()
		expectVisibleBitmap()
		expect(dark.contains(preview())).toBe(true)
		expect(getComputedStyle(darkImage).opacity).toBe('0')
		expect(Object.hasOwn(original.dataset, 'zoomImagePending')).toBe(false)
		await expect.poll(() => viewer().querySelector('.amk-lightbox-image-preview')).toBeNull()
		expect(getComputedStyle(darkImage).opacity).toBe('1')
	} finally {
		await closeLightbox()
		delete document.documentElement.dataset.imageTestDark
	}
})

it('keeps returned pixels visible and supports reopening before the large image arrives', async () => {
	const { box, original } = await fixture({ automatic: true })
	prepareLightbox(box)
	await openLightbox(box)
	const bitmap = preview()
	expectVisibleBitmap()
	await closeLightbox()
	for (let frame = 0; frame < 5; frame++) {
		const source =
			box.querySelector<HTMLCanvasElement | HTMLImageElement>('.amk-lightbox-image-preview') ??
			original
		const context = document.createElement('canvas').getContext('2d')!
		context.drawImage(source, 0, 0, 1, 1)
		expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(255)
		expect(Number(getComputedStyle(source).opacity)).toBeGreaterThan(0)
		await frames(1)
	}

	expect(box.contains(original)).toBe(true)
	await openLightbox(box)
	expect(viewer().contains(original)).toBe(true)
	await expect.poll(() => original.complete && original.naturalWidth > 0).toBe(true)
	await expect.poll(() => viewer().querySelector('.amk-lightbox-image-preview')).toBeNull()
	await closeLightbox()
	await expect.poll(() => bitmap.width).toBe(0)
	expect(Object.hasOwn(original.dataset, 'zoomImagePending')).toBe(false)
})

it('retains the fitted candidate during a later native zoom upgrade', async () => {
	try {
		// The fitted image still fits its small candidate; only native zoom needs
		// the larger, uncached one.
		await page.viewport(400, 300)
		const { box, original } = await fixture({ picture: true })
		await openLightbox(box)
		await expect.poll(() => viewer().querySelector('.amk-lightbox-image-preview')).toBeNull()
		query(viewer(), '.amk-lightbox-zoom').click()
		await frames()
		expectVisibleBitmap(400)
		expect(getComputedStyle(original).opacity).toBe('0')
		await expect.poll(() => original.complete && original.currentSrc.includes('-1600.')).toBe(true)
		await expect.poll(() => viewer().querySelector('.amk-lightbox-image-preview')).toBeNull()
		expect(getComputedStyle(original).opacity).toBe('1')
	} finally {
		await closeLightbox()
		await page.viewport(1280, 800)
	}
})
