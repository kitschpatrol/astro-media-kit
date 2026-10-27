import { afterEach, describe, expect, it, vi } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { subjectOf } from '../../src/components/internal/lightbox/dom'
import {
	closeLightbox,
	openLightbox,
	prepareLightbox,
} from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	block,
	boxes,
	cleanUp,
	clickMiddle,
	close,
	currentLayer,
	fadeOf,
	gallery,
	imageItem,
	isLifted,
	item,
	link,
	mount,
	playerItem,
	query,
	settle,
	setUpLightbox,
	trackOffset,
	transitionsDone,
	viewer,
} from './helpers'

const clippedPattern = /^inset\(/v
const fullInsetPattern = /^inset\(0(?:px)?\)$/v
const largeCandidatePattern = /-(?:960|1600)\.jpg$/v
const smallCandidatePattern = /-480\.jpg$/v
setUpLightbox()
afterEach(cleanUp)

describe('lifting', () => {
	it('opens on click and moves the subject itself into the viewer', async () => {
		const fixture = mount(item(block('a')))
		const subject = query(fixture, '.subject')

		await userEvent.click(query(fixture, '.amk-zoom'))

		await expect.poll(() => viewer().dataset.state).toBe('open')
		expect(viewer().matches(':modal')).toBe(true)
		expect(subject.closest('.amk-lightbox-frame')).not.toBeNull()
		expect(viewer().querySelector('.subject')).toBe(subject)
		expect(document.querySelectorAll('.subject')).toHaveLength(2)
		expect(query(fixture, '[data-preview]').inert).toBe(true)
	})

	it('opens with Enter and Space', async () => {
		const fixture = mount(item(block('a')))
		const [box] = boxes(fixture)

		box!.focus()
		await userEvent.keyboard('{Enter}')
		await expect.poll(() => viewer().open).toBe(true)
		await close()

		box!.focus()
		await userEvent.keyboard(' ')
		await expect.poll(() => viewer().open).toBe(true)
	})

	it('holds the subject’s place so the page does not reflow', async () => {
		const fixture = mount(`${item(block('a'))}<p class="after">after</p>`)
		const [box] = boxes(fixture)
		const after = query(fixture, '.after')
		const boxBefore = box!.getBoundingClientRect()
		const afterBefore = after.getBoundingClientRect()

		await openLightbox(box!)

		expect(box!.getBoundingClientRect().height).toBeCloseTo(boxBefore.height, 1)
		expect(box!.getBoundingClientRect().width).toBeCloseTo(boxBefore.width, 1)
		expect(after.getBoundingClientRect().top).toBeCloseTo(afterBefore.top, 1)
	})

	it('starts the transition exactly on top of the subject in the page', async () => {
		const fixture = mount(item(block('a', 'aspect-ratio: 3 / 2'), 'style="width: 300px"'))
		const [box] = boxes(fixture)
		const before = query(fixture, '.subject').getBoundingClientRect()

		const opening = openLightbox(box!)
		const start = query(document, '.amk-lightbox-layer').getBoundingClientRect()
		await opening
		const end = query(document, '.amk-lightbox-layer').getBoundingClientRect()
		const frame = query(document, '.amk-lightbox-frame').getBoundingClientRect()

		expect(start.x).toBeCloseTo(before.x, 0)
		expect(start.y).toBeCloseTo(before.y, 0)
		expect(start.width).toBeCloseTo(before.width, 0)
		expect(start.height).toBeCloseTo(before.height, 0)
		expect(end.width).toBeGreaterThan(before.width * 1.5)
		expect(end.width / end.height).toBeCloseTo(1.5, 1)
		expect(end.x).toBeCloseTo(frame.x, 1)
		expect(end.width).toBeCloseTo(frame.width, 1)
	})

	it('reveals a cropped thumbnail without distorting it', async () => {
		const fixture = mount(
			item(
				`<img src="/media/aurora-480.jpg" width="2400" height="1600" alt=""
					style="width: 100%; height: 100%; object-fit: cover" />`,
				'style="width: 120px; height: 120px"',
			),
		)
		const image = query(fixture, 'img', HTMLImageElement)
		await image.decode()
		const before = image.getBoundingClientRect()

		const opening = openLightbox(boxes(fixture)[0]!)
		const layer = query(document, '.amk-lightbox-layer')
		const start = layer.getBoundingClientRect()
		const startClip = getComputedStyle(layer).clipPath
		await opening

		expect(start.height).toBeCloseTo(before.height, 0)
		expect(start.width).toBeCloseTo(before.height * 1.5, 0)
		expect(start.x + start.width / 2).toBeCloseTo(before.x + before.width / 2, 0)
		expect(startClip).toMatch(clippedPattern)
		expect(getComputedStyle(layer).clipPath).toMatch(fullInsetPattern)
	})

	it('puts the subject back where it was on close, keeping the item’s own styles', async () => {
		const fixture = mount(item(block('a'), 'style="width: 300px"'))
		const [box] = boxes(fixture)
		const subject = query(fixture, '.subject')
		const before = subject.getBoundingClientRect()

		await openLightbox(box!)
		await close()

		expect(subject.parentElement).toBe(box)
		expect(isLifted(box!)).toBe(false)
		expect(box!.style.width).toBe('300px')
		expect(box!.style.getPropertyValue('--amk-lightbox-placeholder-width')).toBe('')
		expect(document.querySelectorAll('.amk-lightbox-slide')).toHaveLength(0)
		const after = subject.getBoundingClientRect()
		expect(after.x).toBeCloseTo(before.x, 1)
		expect(after.y).toBeCloseTo(before.y, 1)
	})

	it('fades an image in steeply over its placeholder as the opening zoom starts', async () => {
		const fixture = mount(imageItem())
		await query(fixture, 'img', HTMLImageElement).decode()
		const opening = openLightbox(boxes(fixture)[0]!)
		const layer = query(document, '.amk-lightbox-layer')
		const fade = fadeOf(layer)!
		fade.pause()
		expect(fade.effect?.getTiming().duration).toBe(300)
		expect(getComputedStyle(layer).opacity).toBe('0')
		fade.currentTime = 60
		expect(Number(getComputedStyle(layer).opacity)).toBeGreaterThan(0.5)
		expect(Number(getComputedStyle(layer).opacity)).toBeLessThan(0.65)
		fade.currentTime = 150
		expect(Number(getComputedStyle(layer).opacity)).toBeGreaterThan(0.85)
		expect(Number(getComputedStyle(layer).opacity)).toBeLessThan(1)
		fade.finish()
		await opening
		expect(getComputedStyle(layer).opacity).toBe('1')
	})

	it('fades an image out into its placeholder as it zooms home, on the opening curve', async () => {
		const fixture = mount(imageItem())
		const box = boxes(fixture)[0]!
		const subject = query(fixture, 'img', HTMLImageElement)
		await subject.decode()
		await openLightbox(box)
		const layer = query(document, '.amk-lightbox-layer')
		const closing = closeLightbox()
		const fade = fadeOf(layer)!
		fade.pause()
		expect(fade.effect?.getTiming().duration).toBe(300)
		expect(getComputedStyle(layer).opacity).toBe('1')
		fade.currentTime = 60
		expect(Number(getComputedStyle(layer).opacity)).toBeGreaterThan(0.35)
		expect(Number(getComputedStyle(layer).opacity)).toBeLessThan(0.5)
		expect(subject.parentElement).toBe(layer)
		expect(box.querySelector('[data-preview]')).not.toBeNull()
		fade.finish()
		await closing
		expect(subject.parentElement).toBe(box)
		expect(box.querySelector('[data-preview]')).toBeNull()
		expect(viewer().open).toBe(false)
	})

	it('can restore during the closing fade without affecting a newly opened viewer', async () => {
		const fixture = mount(imageItem())
		const box = boxes(fixture)[0]!
		await query(fixture, 'img', HTMLImageElement).decode()
		await openLightbox(box)
		const layer = query(document, '.amk-lightbox-layer')
		const closing = closeLightbox()
		await expect.poll(() => Number(getComputedStyle(layer).opacity)).toBeLessThan(1)
		await closeLightbox(true)
		await openLightbox(box)
		await closing
		expect(viewer().open).toBe(true)
		expect(getComputedStyle(query(document, '.amk-lightbox-layer')).opacity).toBe('1')
	})

	it('reverses opening and closing on clicks before the transitions finish', async () => {
		const fixture = mount(item(block('a')))
		const box = boxes(fixture)[0]!
		const subject = query(box, '.subject')
		const opening = openLightbox(box)
		const layer = currentLayer()
		for (const state of ['closing', 'open', 'closing', 'open']) {
			clickMiddle(layer)
			expect(viewer().dataset.state).toBe(state)
		}

		await opening
		await transitionsDone()
		expect(viewer().open).toBe(true)
		expect(subject.parentElement).toBe(layer)
		expect(getComputedStyle(layer).translate).toBe('none')
		expect(getComputedStyle(layer).opacity).toBe('1')
	})

	it('brings a fading subject back when clicked', async () => {
		const fixture = mount(imageItem())
		const box = boxes(fixture)[0]!
		await query(fixture, 'img', HTMLImageElement).decode()
		await openLightbox(box)
		const layer = currentLayer()
		const closing = closeLightbox()
		await expect.poll(() => Number(getComputedStyle(layer).opacity)).toBeLessThan(0.9)
		clickMiddle(layer)
		await closing
		await transitionsDone()
		expect(viewer().open).toBe(true)
		expect(viewer().dataset.state).toBe('open')
		expect(getComputedStyle(layer).opacity).toBe('1')
		await closeLightbox()
		expect(query(box, 'img').parentElement).toBe(box)
	})

	it('keeps closing when a click misses the returning subject', async () => {
		const fixture = mount(item(block('a')))
		await openLightbox(boxes(fixture)[0]!)
		const closing = closeLightbox()
		viewer().dispatchEvent(
			new MouseEvent('click', {
				bubbles: true,
				clientX: window.innerWidth - 4,
				clientY: window.innerHeight - 4,
				detail: 1,
			}),
		)
		await closing
		expect(viewer().open).toBe(false)
	})

	it('skips both fades without a placeholder', async () => {
		const fixture = mount(imageItem('data-placeholder="none"'))
		await query(fixture, 'img', HTMLImageElement).decode()
		const opening = openLightbox(boxes(fixture)[0]!)
		const layer = query(document, '.amk-lightbox-layer')
		expect(getComputedStyle(layer).opacity).toBe('1')
		await opening
		const closing = closeLightbox()
		expect(fadeOf(layer)).toBeUndefined()
		expect(getComputedStyle(layer).opacity).toBe('1')
		await closing
		expect(viewer().open).toBe(false)
	})

	it('cuts HTML over without fading, since its layout can change', async () => {
		const fixture = mount(item(block('a')))
		const opening = openLightbox(boxes(fixture)[0]!)
		const layer = query(document, '.amk-lightbox-layer')
		query(fixture, '[data-preview]')
		expect(fadeOf(layer)).toBeUndefined()
		expect(getComputedStyle(layer).opacity).toBe('1')
		await opening
		const closing = closeLightbox()
		expect(fadeOf(layer)).toBeUndefined()
		expect(getComputedStyle(layer).opacity).toBe('1')
		await closing
		expect(viewer().open).toBe(false)
	})

	it('keeps an image placeholder on the candidate the lifted image loads', async () => {
		const fixture = mount(imageItem())
		const box = boxes(fixture)[0]!
		const image = query(fixture, 'img', HTMLImageElement)
		await image.decode()
		const small = image.currentSrc
		expect(small).toMatch(smallCandidatePattern)
		prepareLightbox(box)
		await openLightbox(box)
		const copy = query(box, '[data-preview]', HTMLImageElement)
		await expect.poll(() => image.currentSrc).not.toBe(small)
		await expect.poll(() => copy.currentSrc).toBe(image.currentSrc)
		await expect.poll(() => copy.complete).toBe(true)
		await close()
		expect(image.parentElement).toBe(box)
	})

	it('closes with Space, unless a focused control uses it', async () => {
		const fixture = mount(gallery(['a', 'b']))
		await openLightbox(boxes(fixture)[0]!)
		query(document, '.amk-lightbox-next').focus()
		await userEvent.keyboard('[Space]')
		await expect.poll(activeSlideLabel).toBe('2 of 2')
		expect(viewer().open).toBe(true)
		viewer().focus()
		await userEvent.keyboard('[Space]')
		await expect.poll(() => viewer().open).toBe(false)
	})

	it('leaves a focused player its keys, except Escape and the left and right arrows', async () => {
		const fixture = mount(`
			${playerItem(
				`
				<div data-interactive style="width: 240px; height: 160px">
					<video muted style="width: 100%; height: 120px"></video>
					<button type="button">Play</button>
				</div>`,
				'data-gallery="p"',
			)}
			${item(block('b'), 'data-gallery="p"')}`)
		await openLightbox(boxes(fixture)[0]!)
		const player = query(viewer(), '[data-interactive]')
		const keys: string[] = []
		player.addEventListener('keydown', (event) => {
			keys.push(event.key)
		})
		query(player, 'button').focus()
		await userEvent.keyboard('[Space][ArrowUp]')
		expect(viewer().open).toBe(true)
		expect(activeSlideLabel()).toBe('1 of 2')
		await userEvent.keyboard('[ArrowRight]')
		await expect.poll(activeSlideLabel).toBe('2 of 2')
		expect(keys).toEqual([' ', 'ArrowUp'])
	})

	it('leaves a lone video its arrow keys, but closes on Escape even if it claims it', async () => {
		const fixture = mount(
			playerItem(`
				<video controls muted width="1280" height="720" aria-label="Loop"
					style="width: 240px; height: auto"></video>`),
		)
		await openLightbox(boxes(fixture)[0]!)
		const video = query(viewer(), 'video', HTMLVideoElement)
		const keys: string[] = []
		video.addEventListener('keydown', (event) => {
			keys.push(event.key)
			event.preventDefault()
		})
		video.focus()
		await userEvent.keyboard('[ArrowRight][Space]')
		expect(keys).toEqual(['ArrowRight', ' '])
		expect(viewer().open).toBe(true)
		await userEvent.keyboard('[Escape]')
		await expect.poll(() => viewer().open).toBe(false)
		expect(keys).toEqual(['ArrowRight', ' '])
	})

	it('closes with Escape', async () => {
		const fixture = mount(item(block('a')))
		await openLightbox(boxes(fixture)[0]!)

		await userEvent.keyboard('{Escape}')

		await expect.poll(() => viewer().open).toBe(false)
		expect(query(fixture, '.subject').parentElement?.tagName).toBe('DIV')
	})

	it('closes with the close button and when the backdrop area is clicked', async () => {
		const fixture = mount(item(block('a')))
		const [box] = boxes(fixture)

		await openLightbox(box!)
		await userEvent.click(query(document, '.amk-lightbox-close'))
		await expect.poll(() => viewer().open).toBe(false)

		await openLightbox(box!)
		await userEvent.click(query(document, '.amk-lightbox-slide'), { position: { x: 4, y: 4 } })
		await expect.poll(() => viewer().open).toBe(false)
	})

	it('stays open when the item is double-clicked', async () => {
		const fixture = mount(item(block('a')))

		await userEvent.dblClick(query(fixture, '.amk-zoom'))
		await settle()

		expect(viewer().open).toBe(true)
	})

	it('opens instead of following a link around the item', async () => {
		const fixture = mount(`<a href="#followed">${item(block('a'))}</a>`)

		await userEvent.click(query(fixture, '.amk-zoom'))

		await expect.poll(() => viewer().dataset.state).toBe('open')
		expect(location.hash).not.toBe('#followed')
	})

	it('opens from its own fallback link, keeping the link and node identity', async () => {
		const fixture = mount(
			link(
				'/media/tile-2400.jpg',
				'<img src="/media/tile-480.jpg" alt="Tile" width="2400" height="2400" style="width: 100%; height: auto" />',
				'style="width: 200px"',
			),
		)
		const anchor = query(fixture, 'a', HTMLAnchorElement)
		const original = anchor.firstElementChild
		await userEvent.click(anchor)
		await expect.poll(() => viewer().open).toBe(true)
		expect(viewer().querySelector(':scope .amk-lightbox-layer > img')).toBe(original)
		expect(anchor.getAttribute('href')).toBe('/media/tile-2400.jpg')
		expect(anchor.hasAttribute('role')).toBe(false)
	})

	it.each([
		{ ctrlKey: true },
		{ metaKey: true },
		{ shiftKey: true },
		{ altKey: true },
		{ button: 1 },
	])('preserves native link activation for %j', (options) => {
		const fixture = mount(link('/media/tile-2400.jpg', block('a')))
		let wasPrevented = false
		fixture.addEventListener('click', (event) => {
			wasPrevented = event.defaultPrevented
			event.preventDefault()
		})
		query(fixture, 'a').dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, ...options }),
		)
		expect(wasPrevented).toBe(false)
		expect(document.querySelector('dialog[open]')).toBeNull()
	})

	it.each([
		['download', false],
		['target="_blank"', false],
		['target="_self"', true],
	])('leaves a link with %s to the browser: opens %s', (attribute, shouldOpen) => {
		const fixture = mount(link('/media/tile-480.jpg', block('a'), attribute))
		let wasPrevented = false
		fixture.addEventListener('click', (event) => {
			wasPrevented = event.defaultPrevented
			event.preventDefault()
		})

		query(fixture, 'a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

		expect(wasPrevented).toBe(shouldOpen)
		expect(document.querySelector('dialog[open]') !== null).toBe(shouldOpen)
	})

	it('can be closed while it is still opening', async () => {
		const fixture = mount(item(block('a')))
		const [box] = boxes(fixture)

		const opening = openLightbox(box!)
		viewer().requestClose()
		await opening

		await expect.poll(() => viewer().open).toBe(false)
		expect(query(fixture, '.subject').parentElement).toBe(box)
	})

	it('ignores open() while the viewer is showing', async () => {
		const fixture = mount(`${item(block('a'))}${item(block('b'))}`)
		const [first, second] = boxes(fixture)

		await openLightbox(first!)
		await openLightbox(second!)

		expect(document.querySelectorAll('.amk-lightbox-slide')).toHaveLength(1)
		expect(query(fixture, '[data-label="b"]').parentElement).toBe(second)
	})

	it('reports whether it opened', async () => {
		const fixture = mount(`${imageItem()}${item('')}`)
		const [box, empty] = boxes(fixture)
		await expect(openLightbox(empty!)).resolves.toBe(false)
		await expect(openLightbox(box!)).resolves.toBe(true)
		await expect(openLightbox(box!)).resolves.toBe(false)
	})

	it('closes cleanly when the page removes a lifted item', async () => {
		const fixture = mount(gallery(['a', 'b']))
		const [first] = boxes(fixture)
		await openLightbox(first!)

		fixture.remove()
		await close()

		expect(subjectOf(first!)?.parentElement).toBe(first)
	})

	it('restores before a client-side navigation swaps the page', async () => {
		const fixture = mount(gallery(['a', 'b']))
		const [first] = boxes(fixture)
		await openLightbox(first!)

		document.dispatchEvent(new Event('astro:before-swap'))

		expect(viewer().open).toBe(false)
		expect(subjectOf(first!)?.parentElement).toBe(first)
		expect(isLifted(first!)).toBe(false)
	})

	it('keeps working after the page replaces <body>', async () => {
		const fixture = mount(item(block('a')))
		await openLightbox(boxes(fixture)[0]!)
		await close()

		const original = document.body
		const replacement = document.createElement('body')
		replacement.innerHTML = item(block('b'))
		original.replaceWith(replacement)
		try {
			await openLightbox(boxes(replacement)[0]!)
			expect(viewer().open).toBe(true)
			await close()
		} finally {
			replacement.replaceWith(original)
		}
	})

	it('preserves page scrollbar geometry and contains scrolling while open', async () => {
		const fixture = mount(
			`<div style="height: 200vh"></div>${item(block('a'))}<div style="height: 200vh"></div>`,
		)
		const [box] = boxes(fixture)
		box!.scrollIntoView({ block: 'center' })
		const { scrollY } = globalThis
		const pageLayout = () =>
			[document.documentElement, document.body].map((element) => ({
				overflow: getComputedStyle(element).overflow,
				padding: getComputedStyle(element).padding,
				width: element.clientWidth,
			}))
		const original = pageLayout()

		await openLightbox(box!)
		expect(pageLayout()).toEqual(original)
		await commands.mouseWheel(0, 500)
		await userEvent.keyboard('{PageDown}{ArrowDown} ')
		await settle()
		expect(window.scrollY).toBeCloseTo(scrollY, 0)
		await close()

		expect(pageLayout()).toEqual(original)
		expect(window.scrollY).toBeCloseTo(scrollY, 0)
	})

	it('keeps a page scrolled to the bottom where it is when an item at the bottom opens', async () => {
		const fixture = mount(`<div style="height: 200vh"></div>${item(block('a'))}`)
		const [box] = boxes(fixture)
		window.scrollTo(0, document.documentElement.scrollHeight)
		const { scrollY } = globalThis
		expect(scrollY).toBeGreaterThan(0)

		await openLightbox(box!)
		expect(window.scrollY).toBeCloseTo(scrollY, 0)
		await close()

		expect(window.scrollY).toBeCloseTo(scrollY, 0)
	})

	it('leaves the page where it is when an item partly in view opens and closes', async () => {
		const fixture = mount(
			`<div style="height: 200vh"></div>${item(block('a', 'width: 240px; height: 1000px'))}<div style="height: 50vh"></div>`,
		)
		const [box] = boxes(fixture)
		// The top half of the item is above the viewport
		window.scrollTo(0, box!.offsetTop + 500)
		const { scrollY } = globalThis
		expect(box!.getBoundingClientRect().top).toBeLessThan(0)

		await openLightbox(box!)
		expect(window.scrollY).toBe(scrollY)
		await close()

		expect(window.scrollY).toBe(scrollY)
	})

	it('keeps a scroll container scrolled to the bottom where it is when its last item opens', async () => {
		const fixture = mount(
			`<div class="scroller" style="height: 300px; overflow: auto"><div style="height: 600px"></div>${item(block('a'))}</div>`,
		)
		const scroller = query(fixture, '.scroller')
		scroller.scrollTop = scroller.scrollHeight
		const { scrollTop } = scroller
		expect(scrollTop).toBeGreaterThan(0)

		await openLightbox(boxes(fixture)[0]!)
		expect(scroller.scrollTop).toBe(scrollTop)
		await close()

		expect(scroller.scrollTop).toBe(scrollTop)
	})

	it('keeps the scroll position on pages whose body scrolls the viewport', async () => {
		const style = document.createElement('style')
		style.textContent = 'html, body { height: 100% } body { overflow-x: hidden }'
		document.head.append(style)
		try {
			const fixture = mount(`<div style="height: 300vh"></div>${item(block('a'))}`)
			const [box] = boxes(fixture)
			box!.scrollIntoView({ block: 'center' })
			const { scrollY } = globalThis
			expect(scrollY).toBeGreaterThan(0)

			await openLightbox(box!)
			expect(window.scrollY).toBeCloseTo(scrollY, 0)
			await close()

			expect(window.scrollY).toBeCloseTo(scrollY, 0)
		} finally {
			style.remove()
		}
	})

	it('covers the viewport whatever the page’s own dialog styles', async () => {
		const style = document.createElement('style')
		style.textContent = `
			dialog { max-width: 30rem; padding: 2rem; border: 4px solid; background: white; }
			dialog[open] { display: flex; align-items: center; }`
		document.head.append(style)
		try {
			await openLightbox(boxes(mount(item(block('a'))))[0]!)

			const rect = viewer().getBoundingClientRect()
			expect(rect.width).toBeCloseTo(window.innerWidth, 0)
			expect(rect.height).toBeCloseTo(window.innerHeight, 0)
			expect(getComputedStyle(viewer()).backgroundColor).toBe('rgba(0, 0, 0, 0)')
		} finally {
			style.remove()
		}
	})

	it('fills its frame whatever transforms the page gives the subject', async () => {
		const style = document.createElement('style')
		style.textContent =
			'.subject { transform: scale(2); translate: 10px 10px; rotate: 5deg; scale: 1.5; }'
		document.head.append(style)
		try {
			await openLightbox(boxes(mount(item(block('a'))))[0]!)

			const subject = query(document, '.amk-lightbox-layer > .subject').getBoundingClientRect()
			const frame = query(document, '.amk-lightbox-frame').getBoundingClientRect()
			expect(subject.x).toBeCloseTo(frame.x, 0)
			expect(subject.y).toBeCloseTo(frame.y, 0)
			expect(subject.width).toBeCloseTo(frame.width, 0)
			expect(subject.height).toBeCloseTo(frame.height, 0)
		} finally {
			style.remove()
		}
	})

	it('skips the motion for people who prefer reduced motion, despite a page duration', async () => {
		await commands.emulateReducedMotion(true)
		try {
			const fixture = mount(gallery(['a', 'b']))

			const opening = openLightbox(boxes(fixture)[0]!)
			expect(query(document, '.amk-lightbox-layer').getAnimations()).toHaveLength(0)
			await opening
			for (const property of [
				'--amk-lightbox-open-fade-duration',
				'--amk-lightbox-close-fade-duration',
			]) {
				expect(getComputedStyle(viewer()).getPropertyValue(property).trim()).toBe('0s')
			}

			query(document, '.amk-lightbox-next').click()
			expect(trackOffset()).toBe(query(document, '.amk-lightbox-track').clientWidth)
			expect(Object.hasOwn(query(document, '.amk-lightbox-track').dataset, 'moving')).toBe(false)
			await closeLightbox()
			expect(viewer().open).toBe(false)
		} finally {
			await commands.emulateReducedMotion(false)
		}
	})
})

describe('content', () => {
	it('copies the figure caption into the viewer, without its controls', async () => {
		const fixture = mount(`
			<figure>
				${item(block('a'))}
				<figcaption>Hello <a id="credit" href="#x">world</a><button>Like</button></figcaption>
			</figure>`)

		await openLightbox(boxes(fixture)[0]!)

		const caption = query(document, '.amk-lightbox-caption')
		expect(caption.textContent.trim()).toBe('Hello world')
		expect(caption.querySelector('a')?.getAttribute('href')).toBe('#x')
		expect(caption.querySelector('[id], button')).toBeNull()
		expect(query(fixture, 'figcaption').textContent).toContain('Hello')
	})

	it('keeps every slide as wide as the viewer when a caption cannot wrap', async () => {
		const unbreakable = 'x'.repeat(400)
		const fixture = mount(
			['a', 'b']
				.map(
					(label) =>
						`<figure>${item(block(label), 'data-gallery="g"')}<figcaption>${unbreakable}</figcaption></figure>`,
				)
				.join(''),
		)

		await openLightbox(boxes(fixture)[0]!)

		const { clientWidth } = query(document, '.amk-lightbox-track')
		for (const slide of document.querySelectorAll('.amk-lightbox-slide')) {
			expect(slide.getBoundingClientRect().width).toBeCloseTo(clientWidth, 0)
		}
	})

	it('lets lifted images select a larger srcset candidate, offscreen neighbors included', async () => {
		// Chromium can reuse a larger candidate cached by an earlier zoom test.
		// Isolate these requests so the test actually starts with a small source.
		const image = (name: string) =>
			item(
				`<img src="/media/${name}-480.jpg?lifted-sources" alt="" loading="lazy" sizes="auto" width="2400" height="2400"
					srcset="/media/${name}-480.jpg?lifted-sources 480w, /media/${name}-960.jpg?lifted-sources 960w, /media/${name}-1600.jpg?lifted-sources 1600w"
					style="width: 100%; height: auto" />`,
				'data-gallery="g" style="width: 160px"',
			)
		const fixture = mount(image('tile') + image('aurora'))
		const [current, neighbor] = fixture.querySelectorAll('img')
		await expect
			.poll(() => (current?.naturalWidth ?? 0) > 0 && (neighbor?.naturalWidth ?? 0) > 0)
			.toBe(true)
		expect(current?.currentSrc).toContain('-480.')

		await openLightbox(boxes(fixture)[0]!)

		await expect.poll(() => current?.currentSrc.split('?', 1)[0]).toMatch(largeCandidatePattern)
		await expect.poll(() => neighbor?.currentSrc.split('?', 1)[0]).toMatch(largeCandidatePattern)
	})

	it('decodes images normally while lifted, then restores the attribute', async () => {
		const fixture = mount(
			item('<img src="/media/tile-480.jpg" decoding="async" width="2400" height="2400" alt="" />'),
		)
		const image = query(fixture, 'img', HTMLImageElement)
		await image.decode()

		await openLightbox(boxes(fixture)[0]!)
		expect(image.getAttribute('decoding')).toBe('auto')
		await close()

		expect(image.getAttribute('decoding')).toBe('async')
	})

	it('keeps the page’s text color on lifted elements', async () => {
		const fixture = mount(item('<p class="subject">Hi</p>'))
		const subject = query(fixture, '.subject')

		await openLightbox(boxes(fixture)[0]!)

		expect(getComputedStyle(subject).color).toBe(getComputedStyle(document.body).color)
		expect(getComputedStyle(query(document, '.amk-lightbox-close')).color).toBe(
			'rgb(244, 244, 245)',
		)
	})

	it('leaves clicks on interactive content alone', async () => {
		const fixture = mount(item('<div class="subject"><button>Like</button></div>'))

		await userEvent.click(query(fixture, 'button'))

		expect(document.querySelector('dialog.amk-lightbox[open]')).toBeNull()
	})

	it('opens an interactive item from its zoom button, and closes from the same button', async () => {
		const fixture = mount(
			playerItem(`
				<div data-interactive="" style="width: 240px; height: 160px; background: teal">
					<button type="button" data-zoom-open="">Expand</button>
				</div>`),
		)
		const button = query(fixture, 'button')
		const box = boxes(fixture)[0]!
		expect(box.hasAttribute('role')).toBe(false)
		expect(box.hasAttribute('tabindex')).toBe(false)

		await userEvent.click(query(fixture, '[data-interactive]'), { position: { x: 200, y: 140 } })
		expect(document.querySelector('dialog.amk-lightbox[open]')).toBeNull()

		await userEvent.click(button)
		await expect.poll(() => viewer().dataset.state).toBe('open')
		expect(viewer().contains(button)).toBe(true)

		await userEvent.click(button)
		await expect.poll(() => viewer().open).toBe(false)
		expect(box.contains(button)).toBe(true)
	})

	it('opens and closes from an empty opener in the subject shadow root', async () => {
		const fixture = mount(
			playerItem('<div class="player" style="width: 200px; height: 100px"></div>'),
		)
		const shadow = query(fixture, '.player').attachShadow({ mode: 'open' })
		shadow.innerHTML = '<button type="button" data-zoom-open>Expand</button>'
		const expand = query(shadow, 'button')

		expand.click()
		await expect.poll(() => viewer().dataset.state).toBe('open')
		expect(viewer().contains(shadow.host)).toBe(true)

		expand.click()
		await expect.poll(() => viewer().open).toBe(false)
		expect(boxes(fixture)[0]!.contains(shadow.host)).toBe(true)
	})

	it('keeps a playing video playing through open and close', async () => {
		const fixture = mount(
			item(`
				<video muted autoplay loop playsinline width="1280" height="720">
					<source src="/media/loop.mp4" type="video/mp4" />
					<source src="/media/loop.webm" type="video/webm" />
				</video>`),
		)
		const video = query(fixture, 'video', HTMLVideoElement)
		await expect.poll(() => video.currentTime, { timeout: 5000 }).toBeGreaterThan(0.2)
		const events: string[] = []
		for (const type of ['pause', 'emptied', 'abort', 'loadstart', 'seeking']) {
			video.addEventListener(type, () => {
				events.push(type)
			})
		}

		const beforeOpen = video.currentTime
		await openLightbox(boxes(fixture)[0]!)
		await expect.poll(() => video.currentTime).toBeGreaterThan(beforeOpen + 0.1)
		const beforeClose = video.currentTime
		await close()
		await expect.poll(() => video.currentTime).toBeGreaterThan(beforeClose + 0.1)

		expect(video.paused).toBe(false)
		expect(events).toEqual([])
	})

	it('warms the fitted candidate on hover and focus without changing the thumbnail', async () => {
		await commands.mouseMove(1200, 760)
		const fixture = mount(
			item(
				`<picture>
					<source type="image/webp" sizes="auto, 160px" srcset="/media/aurora-480.webp 480w, /media/aurora-1600.webp 1600w">
					<img src="/media/aurora-480.jpg" srcset="/media/aurora-480.jpg 480w, /media/aurora-1600.jpg 1600w" sizes="auto, 160px" loading="lazy" width="2400" height="1600" alt="Aurora" style="width: 100%; height: auto">
				</picture>`,
				'style="width: 160px"',
			),
		)
		const box = boxes(fixture)[0]!
		const target = query(fixture, 'img', HTMLImageElement)
		await expect.poll(() => target.naturalWidth).toBeGreaterThan(0)
		const original = target.currentSrc
		const decode = vi.spyOn(HTMLImageElement.prototype, 'decode')
		try {
			box.focus()
			await expect.poll(() => decode.mock.contexts.length).toBeGreaterThan(0)
			const warmed = decode.mock.contexts[0]
			if (!(warmed instanceof HTMLImageElement)) {
				throw new TypeError('Expected a detached image to decode')
			}

			await warmed.decode()
			expect(warmed.isConnected).toBe(false)
			expect(warmed.currentSrc).toContain('1600.webp')
			expect(target.currentSrc).toBe(original)
			expect(target.sizes).toBe('auto, 160px')
			expect(target.loading).toBe('lazy')
			box.blur()
			await settle(50)
			decode.mockClear()

			const rect = box.getBoundingClientRect()
			await commands.mouseMove(rect.x + 10, rect.y + 10)
			await expect.poll(() => decode.mock.contexts.length).toBeGreaterThan(0)
			expect(decode.mock.contexts[0]).not.toBe(target)
			await commands.mouseMove(1200, 760)
			await settle(50)
			expect(target.currentSrc).toBe(original)
			expect(target.sizes).toBe('auto, 160px')
		} finally {
			decode.mockRestore()
		}
	})
})
