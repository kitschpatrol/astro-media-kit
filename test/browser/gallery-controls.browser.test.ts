import { afterEach, expect, it } from 'vitest'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import { boxes, cleanUp, gallery, mount, query, setUpLightbox, viewer } from './helpers'
import '../../src/components/internal/carousel/carousel.css'

type GalleryKind = 'carousel' | 'lightbox'

setUpLightbox()
afterEach(async () => {
	await cleanUp()
	document.querySelector('.amk-lightbox')?.removeAttribute('style')
	document.querySelector('.amk-lightbox')?.removeAttribute('dir')
})

async function controls(kind: GalleryKind): Promise<{
	icon: HTMLElement
	next: HTMLElement
	previous: HTMLElement
	root: HTMLElement
}> {
	let root: HTMLElement
	if (kind === 'lightbox') {
		const fixture = mount(gallery(['first', 'second']))
		await openLightbox(boxes(fixture)[0]!)
		root = viewer()
	} else {
		const fixture = mount(`<div class="amk-carousel" style="width: 400px">
			<div class="amk-carousel-viewport" style="height: 240px">
				<button class="amk-carousel-button amk-carousel-previous" aria-disabled="true" aria-label="Previous">
					<span class="amk-carousel-icon"><svg viewBox="0 0 24 24"></svg></span>
				</button>
				<button class="amk-carousel-button amk-carousel-next" aria-label="Next">
					<span class="amk-carousel-icon"><svg viewBox="0 0 24 24"></svg></span>
				</button>
			</div>
		</div>`)
		root = query(fixture, '.amk-carousel')
	}

	const next = query(root, `.amk-${kind}-next`)
	return {
		icon: query(next, `.amk-${kind}-icon`),
		next,
		previous: query(root, `.amk-${kind}-previous`),
		root,
	}
}

it.each(['carousel', 'lightbox'] as const)('preserves the default %s controls', async (kind) => {
	const { icon, next } = await controls(kind)
	const style = getComputedStyle(next)
	expect(style.width).toBe('44px')
	expect(style.height).toBe('44px')
	expect(style.borderRadius).toBe('50%')
	expect(style.color).toBe('rgb(244, 244, 244)')
	expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0.6)')
	expect(getComputedStyle(icon).width).toBe('20px')
})

it.each(['carousel', 'lightbox'] as const)(
	'resolves locally inherited shared defaults and component overrides in the %s',
	async (kind) => {
		const { icon, next, root } = await controls(kind)
		root.style.setProperty('--amk-gallery-control-size', '60px')
		root.style.setProperty('--amk-gallery-control-color', 'rgb(90 90 90)')
		root.style.setProperty('--amk-gallery-control-background', 'rgb(200 200 200)')
		root.style.setProperty('--amk-gallery-control-radius', '8px')
		root.style.setProperty('--amk-gallery-icon-size', '28px')
		expect(getComputedStyle(next).width).toBe('60px')
		expect(getComputedStyle(next).height).toBe('60px')
		expect(getComputedStyle(next).color).toBe('rgb(90, 90, 90)')
		expect(getComputedStyle(next).borderRadius).toBe('8px')
		expect(getComputedStyle(icon).width).toBe('28px')
		await expect.poll(() => getComputedStyle(next).backgroundColor).toBe('rgb(200, 200, 200)')

		root.style.setProperty(`--amk-${kind}-control-size`, '48px')
		root.style.setProperty(`--amk-${kind}-control-color`, 'rgb(120 120 120)')
		root.style.setProperty(`--amk-${kind}-icon-size`, '22px')
		expect(getComputedStyle(next).width).toBe('48px')
		expect(getComputedStyle(next).color).toBe('rgb(120, 120, 120)')
		expect(getComputedStyle(icon).width).toBe('22px')
	},
)

it.each(['carousel', 'lightbox'] as const)(
	'sizes rectangular %s arrows while preserving component size precedence',
	async (kind) => {
		const { next, root } = await controls(kind)
		root.style.setProperty('--amk-gallery-control-width', '52px')
		root.style.setProperty('--amk-gallery-control-height', '88px')
		expect(getComputedStyle(next).width).toBe('52px')
		expect(getComputedStyle(next).height).toBe('88px')

		root.style.setProperty(`--amk-${kind}-control-size`, '36px')
		expect(getComputedStyle(next).width).toBe('36px')
		expect(getComputedStyle(next).height).toBe('36px')
		root.style.setProperty(`--amk-${kind}-control-width`, '60px')
		expect(getComputedStyle(next).width).toBe('60px')
		expect(getComputedStyle(next).height).toBe('36px')
	},
)

it.each(['carousel', 'lightbox'] as const)(
	'places %s arrows at the configured insets in both reading directions',
	async (kind) => {
		const { next, previous, root } = await controls(kind)
		root.style.setProperty('--amk-gallery-control-inset', '24px')
		root.style.setProperty('--amk-gallery-control-block-position', '40%')
		const box = root.getBoundingClientRect()
		expect(previous.getBoundingClientRect().left).toBeCloseTo(box.left + 24, 0)
		expect(next.getBoundingClientRect().right).toBeCloseTo(box.right - 24, 0)
		expect(next.getBoundingClientRect().top).toBeCloseTo(box.top + box.height * 0.4 - 22, 0)

		root.dir = 'rtl'
		expect(previous.getBoundingClientRect().right).toBeCloseTo(box.right - 24, 0)
		expect(next.getBoundingClientRect().left).toBeCloseTo(box.left + 24, 0)
		root.style.setProperty(`--amk-${kind}-control-inset`, '32px')
		root.style.setProperty(`--amk-${kind}-control-block-position`, '60%')
		expect(next.getBoundingClientRect().left).toBeCloseTo(box.left + 32, 0)
		expect(next.getBoundingClientRect().top).toBeCloseTo(box.top + box.height * 0.6 - 22, 0)
	},
)

it('sizes and positions the close and zoom buttons independently of gallery arrows', async () => {
	const { next, root } = await controls('lightbox')
	root.style.setProperty('--amk-gallery-control-width', '52px')
	root.style.setProperty('--amk-gallery-control-height', '88px')
	root.style.setProperty('--amk-lightbox-close-width', '44px')
	root.style.setProperty('--amk-lightbox-close-height', '36px')
	root.style.setProperty('--amk-lightbox-close-inset', '20px auto auto 30px')
	root.style.setProperty('--amk-lightbox-zoom-width', '40px')
	root.style.setProperty('--amk-lightbox-zoom-height', '38px')
	root.style.setProperty('--amk-lightbox-zoom-inset', '22px 34px auto auto')
	const close = query(root, '.amk-lightbox-close')
	const zoom = query(root, '.amk-lightbox-zoom')
	zoom.hidden = false
	expect(next.getBoundingClientRect().width).toBe(52)
	expect(next.getBoundingClientRect().height).toBe(88)
	expect(close.getBoundingClientRect().width).toBe(44)
	expect(close.getBoundingClientRect().height).toBe(36)
	expect(close.getBoundingClientRect().left).toBe(30)
	expect(close.getBoundingClientRect().top).toBe(20)
	expect(zoom.getBoundingClientRect().width).toBe(40)
	expect(zoom.getBoundingClientRect().height).toBe(38)
	expect(zoom.getBoundingClientRect().right).toBe(window.innerWidth - 34)
	expect(zoom.getBoundingClientRect().top).toBe(22)
})
