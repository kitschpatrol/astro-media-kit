import { afterEach, expect, it } from 'vitest'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import '../../src/components/internal/videojs-ui'
import '../../src/components/internal/videojs-media'
import '../../src/components/internal/amk-video.css'
import { cleanUp, mountPage, query, setUpLightbox, viewer } from './helpers'

setUpLightbox()
afterEach(cleanUp)

function visibleText(root: HTMLElement): Array<{ bounds: DOMRect; text: string }> {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
	const result: Array<{ bounds: DOMRect; text: string }> = []
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		const text = node.textContent?.trim() ?? ''
		if (text === '' || node.parentElement?.checkVisibility({ opacityProperty: true }) !== true) {
			continue
		}

		const range = document.createRange()
		range.selectNodeContents(node)
		result.push({ bounds: range.getBoundingClientRect(), text })
	}

	return result
}

async function playerPage() {
	const fixture = await mountPage('/zoom/')
	document.dispatchEvent(new Event('astro:page-load'))
	await customElements.whenDefined('video-player')
	const item = query(fixture, '#video .amk-zoom')
	const player = query(item, 'video-player')
	await expect
		.poll(() => query(player, 'media-play-button').getAttribute('aria-label'))
		.toBe('Play')
	await expect.poll(() => player.querySelector(':scope .amk-icon svg')).not.toBeNull()
	await expect.poll(() => query(player, 'video', HTMLVideoElement).readyState).toBeGreaterThan(0)
	await expect
		.poll(() => query(player, 'media-time[type="duration"]').getAttribute('datetime'))
		.toBe('PT8S')
	await expect
		.poll(() => query(player, '.amk-controls').getBoundingClientRect().width)
		.toBeGreaterThan(0)
	const images = [...fixture.querySelectorAll('img')]
	for (const image of images) {
		image.loading = 'eager'
	}

	await expect
		.poll(() => images.every((image) => !image.checkVisibility() || image.complete))
		.toBe(true)
	return { fixture, item, player }
}

it.each([240, 480])(
	'leaves inert control artwork at the page size of %s without creating another player',
	async (width) => {
		const { fixture, item, player } = await playerPage()
		item.parentElement!.style.width = `${width}px`
		item.style.width = '100%'
		item.scrollIntoView()
		const controls = query(player, '.amk-controls')
		const original = controls.getBoundingClientRect()
		const text = visibleText(controls)
		const icons = [...controls.querySelectorAll('svg')]
			.filter((icon) => icon.checkVisibility())
			.map((icon) => icon.getBoundingClientRect())
		const players = fixture.querySelectorAll('video-player').length
		await openLightbox(item)
		const preview = query(item, '.amk-page-control-preview')
		expect(preview.inert).toBe(true)
		expect(preview.ariaHidden).toBe('true')
		expect(preview.querySelector('svg')).not.toBeNull()
		expect(
			preview.querySelector('[id], [popover], [data-popup], [data-zoom-open], button'),
		).toBeNull()
		expect(
			[...preview.querySelectorAll('*')].some((element) => element.localName.includes('-')),
		).toBe(false)
		expect(document.querySelectorAll('video-player')).toHaveLength(players)
		expect(viewer().contains(controls)).toBe(true)
		const copy = preview.getBoundingClientRect()
		for (const axis of ['x', 'y', 'width', 'height'] as const) {
			expect(copy[axis]).toBeCloseTo(original[axis], 1)
		}

		const copiedIcons = [...preview.querySelectorAll('svg')]
		expect(copiedIcons).toHaveLength(icons.length)
		for (const [index, icon] of copiedIcons.entries()) {
			const bounds = icon.getBoundingClientRect()
			for (const axis of ['x', 'y', 'width', 'height'] as const) {
				expect(bounds[axis]).toBeCloseTo(icons[index]![axis], 1)
			}
		}

		const copiedText = visibleText(preview)
		expect(copiedText.map((part) => part.text)).toEqual(text.map((part) => part.text))
		expect(copiedText.map((part) => part.text)).toEqual(
			width === 240 ? ['0:00'] : ['0:00', '/', '0:08'],
		)
		for (const [index, part] of copiedText.entries()) {
			for (const axis of ['x', 'y', 'width', 'height'] as const) {
				expect(part.bounds[axis]).toBeCloseTo(text[index]!.bounds[axis], 1)
			}
		}

		const bar = [...preview.querySelectorAll<HTMLElement>('span')].find(
			(element) => getComputedStyle(element).backgroundColor === 'rgba(20, 20, 20, 0.7)',
		)
		expect(bar).toBeDefined()
		item.parentElement!.style.width = `${width + 120}px`
		expect(bar!.getBoundingClientRect().width).toBeCloseTo(preview.getBoundingClientRect().width, 1)

		// The fade belongs to the wrapper, rather than a value frozen into the copy.
		item.style.setProperty('--amk-page-controls-opacity', '0')
		await expect.poll(() => getComputedStyle(preview).filter).toBe('opacity(0)')
		item.style.setProperty('--amk-page-controls-opacity', '1')
		await expect.poll(() => getComputedStyle(preview).filter).toBe('opacity(1)')
		await closeLightbox(true)
		// Once the returned player's poster is ready to draw
		await expect.poll(() => item.querySelector('.amk-page-control-preview')).toBeNull()
		expect(item.contains(controls)).toBe(true)
		expect(document.querySelectorAll('video-player')).toHaveLength(players)
	},
)

it('preserves the minimal page controls when a neighboring player is preloaded in the viewer', async () => {
	const { fixture, item } = await playerPage()
	const neighbor = query(fixture, '#video-minimal .amk-zoom')
	item.dataset.gallery = 'controls'
	neighbor.dataset.gallery = 'controls'
	const player = query(neighbor, 'video-player')
	const center = query(player, '.amk-center-play').getBoundingClientRect()
	await openLightbox(item)
	const preview = query(neighbor, '.amk-page-control-preview')
	expect(player.dataset.controls).toBe('lightbox')
	expect(viewer().contains(player)).toBe(true)
	const centerCopy = [...preview.querySelectorAll<HTMLElement>('span')].find((element) => {
		const style = getComputedStyle(element)
		return style.width === `${center.width}px` && style.height === `${center.height}px`
	})
	expect(centerCopy).toBeDefined()
	expect(preview.textContent.trim()).toBe('')
	await closeLightbox(true)
	await expect.poll(() => neighbor.querySelector('.amk-page-control-preview')).toBeNull()
	expect(player.dataset.controls).toBe('minimal')
})

it('omits decorative controls when thumbnail previews are disabled', async () => {
	const { item } = await playerPage()
	item.dataset.placeholder = 'none'
	await openLightbox(item)
	expect(item.querySelector('.amk-page-control-preview')).toBeNull()
	expect(item.querySelector('[data-amk-preview]')).toBeNull()
})
