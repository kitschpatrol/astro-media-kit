import { afterEach, expect, it } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import videoStyles from '../../src/components/internal/amk-video.css?inline'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	cleanUp,
	close,
	mount,
	mountPage,
	query,
	recordTransitions,
	setUpLightbox,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(async () => {
	document.dispatchEvent(new Event('astro:before-swap'))
	await cleanUp()
	document.dispatchEvent(new Event('astro:page-load'))
})

it.each([false, true])(
	'keeps image and caption dimensions unchanged with player CSS %s',
	async (withPlayerStyles) => {
		if (withPlayerStyles) {
			mount(`<style>${videoStyles}</style>`)
		}

		const fixture = await mountPage('/zoom-indicator/')
		for (const width of [600, 180]) {
			for (const host of fixture.querySelectorAll<HTMLElement>('.layout-host')) {
				host.style.width = `${width}px`
			}

			for (const pair of fixture.querySelectorAll<HTMLElement>('.layout-pair')) {
				for (const selector of ['img', 'figcaption']) {
					const before = query(pair, `[data-enabled="false"] ${selector}`).getBoundingClientRect()
					const after = query(pair, `[data-enabled="true"] ${selector}`).getBoundingClientRect()
					expect(
						{ width: after.width, height: after.height },
						`${pair.dataset.component} ${pair.dataset.layout} ${selector} at ${width}`,
					).toEqual({ width: before.width, height: before.height })
				}
			}
		}
	},
)

it('matches the video expand button by default, flush with the bottom-right corner', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const opener = query(fixture, '#builtin .amk-zoom')
	const indicator = query(opener, '.amk-zoom-indicator')
	const style = getComputedStyle(indicator)
	expect(style.width).toBe('44px')
	expect(style.height).toBe('44px')
	expect(style.color).toBe('rgb(255, 255, 255)')
	expect(style.backgroundColor).toBe('rgba(20, 20, 20, 0.7)')
	expect(style.borderRadius).toBe('0px')
	const icon = getComputedStyle(query(indicator, 'svg', SVGElement))
	expect(icon.width).toBe('24px')
	expect(icon.height).toBe('24px')
	const image = query(opener, 'img').getBoundingClientRect()
	const corner = indicator.getBoundingClientRect()
	expect(corner.right).toBeCloseTo(image.right, 1)
	expect(corner.bottom).toBeCloseTo(image.bottom, 1)
	await userEvent.hover(opener)
	const canHover = matchMedia('(hover: hover)').matches
	expect(style.backgroundColor).toBe(canHover ? 'rgba(50, 50, 50, 0.7)' : 'rgba(20, 20, 20, 0.7)')
	expect(style.transitionDuration).toBe(canHover ? '0s' : '0.5s')
})

it('stays on the image where a grid row stretches the wrapper', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const section = query(fixture, '#stretched')
	const opener = query(section, '.amk-zoom')
	const image = query(opener, 'img').getBoundingClientRect()
	const corner = query(opener, '.amk-zoom-indicator').getBoundingClientRect()
	expect(section.getBoundingClientRect().height).toBeGreaterThan(image.height + 100)
	expect(corner.right).toBeCloseTo(image.right, 1)
	expect(corner.bottom).toBeCloseTo(image.bottom, 1)
})

it('supports size, color, corner positioning, and shared idle/active styling', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const section = query(fixture, '#builtin')
	section.style.cssText =
		'--amk-zoom-indicator-size: 28px; --amk-zoom-indicator-icon-size: 16px; --amk-zoom-indicator-color: rgb(200 20 30); --amk-zoom-indicator-inset: 5px auto auto 7px; --amk-gallery-icon-opacity: .4; --amk-gallery-icon-active-opacity: 1; --amk-control-transition-duration: 250ms; --amk-control-active-transition-duration: 0ms; --amk-control-background: rgb(1 2 3); --amk-control-hover-background: rgb(4 5 6);'
	const indicator = query(section, '.amk-zoom-indicator')
	const opener = query(section, '.amk-zoom')
	const style = getComputedStyle(indicator)
	expect(style.width).toBe('28px')
	expect(style.height).toBe('28px')
	expect(getComputedStyle(query(indicator, 'svg', SVGElement)).width).toBe('16px')
	expect(style.color).toBe('rgb(200, 20, 30)')
	expect(style.backgroundColor).toBe('rgb(1, 2, 3)')
	expect(style.top).toBe('5px')
	expect(style.left).toBe('7px')
	expect(style.pointerEvents).toBe('none')
	await expect.poll(() => style.opacity).toBe('0.4')
	expect(style.transitionDuration).toBe('0.25s')
	await userEvent.hover(opener)
	const canHover = matchMedia('(hover: hover)').matches
	expect(style.opacity).toBe(canHover ? '1' : '0.4')
	expect(style.transitionDuration).toBe(canHover ? '0s' : '0.25s')
	expect(style.color).toBe('rgb(200, 20, 30)')
	expect(style.backgroundColor).toBe(canHover ? 'rgb(4, 5, 6)' : 'rgb(1, 2, 3)')

	await userEvent.hover(query(fixture, '#default'))
	opener.focus()
	expect(style.opacity).toBe('1')
})

it.each(['hover', 'focus'] as const)(
	'switches inherited indicator colors on %s and fades back to the resting colors',
	async (interaction) => {
		const fixture = await mountPage('/zoom-indicator/')
		const section = query(fixture, '#builtin')
		section.style.cssText =
			'--amk-zoom-indicator-color: black; --amk-zoom-indicator-background: white; --amk-zoom-indicator-transition-duration: 250ms; --amk-zoom-indicator-active-transition-duration: 0ms;'
		const indicator = query(section, '.amk-zoom-indicator')
		const opener = query(section, '.amk-zoom')
		const style = getComputedStyle(indicator)
		await expect.poll(() => style.color).toBe('rgb(0, 0, 0)')
		await expect.poll(() => style.backgroundColor).toBe('rgb(255, 255, 255)')
		if (interaction === 'hover') {
			await userEvent.hover(opener)
		} else {
			await userEvent.keyboard('{Tab}')
			opener.focus()
		}

		expect(opener.matches(':focus-visible')).toBe(interaction === 'focus')
		// Omitted active tokens retain locally inherited resting colors.
		expect(style.color).toBe('rgb(0, 0, 0)')
		expect(style.backgroundColor).toBe('rgb(255, 255, 255)')
		section.style.setProperty('--amk-zoom-indicator-active-color', 'white')
		section.style.setProperty('--amk-zoom-indicator-active-background', 'black')
		expect(style.color).toBe('rgb(255, 255, 255)')
		expect(style.backgroundColor).toBe('rgb(0, 0, 0)')
		expect(style.transitionDuration).toBe('0s')
		if (interaction === 'focus') {
			await userEvent.hover(opener)
			await userEvent.hover(query(fixture, '#default'))
		}

		expect(style.color).toBe('rgb(255, 255, 255)')
		expect(style.backgroundColor).toBe('rgb(0, 0, 0)')
		const transitions = recordTransitions(indicator, { pause: true })
		if (interaction === 'focus') {
			opener.blur()
		} else {
			await userEvent.hover(query(fixture, '#default .amk-zoom'))
		}

		expect(style.transitionDuration).toBe('0.25s')
		await expect
			.poll(() => transitions.keys().toArray())
			.toEqual(expect.arrayContaining(['color', '--amk-zoom-indicator-painted-background']))
		// Native background-color transitions can flash a stale composited fill in Chromium.
		expect(transitions.has('background-color')).toBe(false)
		const background = transitions.get('--amk-zoom-indicator-painted-background')!
		expect(background.effect!.getTiming().duration).toBe(250)
		background.currentTime = 125
		// The registered color must interpolate, preserving the public background styling.
		expect(style.backgroundColor).not.toBe('rgb(0, 0, 0)')
		expect(style.backgroundColor).not.toBe('rgb(255, 255, 255)')
		for (const transition of transitions.values()) {
			transition.play()
		}

		await expect.poll(() => style.color).toBe('rgb(0, 0, 0)')
		await expect.poll(() => style.backgroundColor).toBe('rgb(255, 255, 255)')
	},
)

it('activates instantly like the player controls and removes transitions with reduced motion', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const section = query(fixture, '#builtin')
	section.style.cssText =
		'--amk-zoom-indicator-opacity: .4; --amk-zoom-indicator-transition-duration: 250ms;'
	const indicator = query(section, '.amk-zoom-indicator')
	const opener = query(section, '.amk-zoom')
	await userEvent.hover(opener)
	const canHover = matchMedia('(hover: hover)').matches
	expect(getComputedStyle(indicator).transitionDuration).toBe(canHover ? '0s' : '0.25s')
	section.style.setProperty('--amk-zoom-indicator-active-transition-duration', '1200ms')
	await commands.emulateReducedMotion(true)
	try {
		expect(getComputedStyle(indicator).transitionDuration).toBe('0s')
		section.style.setProperty('--amk-zoom-indicator-background', 'white')
		section.style.setProperty('--amk-zoom-indicator-active-background', 'black')
		section.style.setProperty('--amk-zoom-indicator-active-color', 'white')
		opener.focus()
		expect(getComputedStyle(indicator).transitionDuration).toBe('0s')
		expect(getComputedStyle(indicator).color).toBe('rgb(255, 255, 255)')
		expect(getComputedStyle(indicator).backgroundColor).toBe('rgb(0, 0, 0)')
		expect(indicator.getAnimations()).toHaveLength(0)
	} finally {
		await commands.emulateReducedMotion(false)
	}
})

it('leaves a mouse-opened item without keyboard-visible focus after Escape', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const items = ['#builtin', '#captioned', '#selector'].map((selector) =>
		query(fixture, `${selector} .amk-zoom`),
	)
	for (const item of items) {
		item.dataset.gallery = 'indicators'
	}

	await userEvent.click(items[0]!)
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await userEvent.keyboard('{Escape}')
	await expect.poll(() => viewer().open).toBe(false)
	expect(items[0]!.matches(':focus-visible')).toBe(false)

	// After navigating with the mouse, the item landed on is left alone too
	await userEvent.click(items[1]!)
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await userEvent.click(query(viewer(), '.amk-lightbox-next'))
	await expect.poll(activeSlideLabel).toBe('3 of 3')
	await userEvent.keyboard('{Escape}')
	await expect.poll(() => viewer().open).toBe(false)
	expect(items[2]!.matches(':focus-visible')).toBe(false)

	// A keyboard opener keeps its focus restoration
	items[0]!.focus()
	await userEvent.keyboard('{Enter}')
	await expect.poll(() => viewer().dataset.state).toBe('open')
	await userEvent.keyboard('{Escape}')
	await expect.poll(() => viewer().open).toBe(false)
	expect(document.activeElement).toBe(items[0])
})

it.each(['#builtin', '#captioned', '#selector'])(
	'fades the %s indicator on its page thumbnail while its media is active in the overlay',
	async (selector) => {
		const fixture = await mountPage('/zoom-indicator/')
		const opener = query(fixture, `${selector} .amk-zoom`)
		opener.scrollIntoView()
		const media = opener.firstElementChild
		const indicator = query(opener, '.amk-zoom-indicator')
		const before = indicator.getBoundingClientRect()
		await openLightbox(opener)
		expect(opener.firstElementChild).toBe(media)
		expect(viewer().querySelector('.amk-zoom-indicator')).toBeNull()
		expect(opener.querySelector('[data-amk-preview]')).toBeNull()
		expect(indicator.parentElement).toBe(opener)
		expect(indicator.checkVisibility()).toBe(true)
		await expect.poll(() => getComputedStyle(indicator).filter).toBe('opacity(0)')
		const enlarged = indicator.getBoundingClientRect()
		for (const axis of ['x', 'y', 'width', 'height'] as const) {
			expect(enlarged[axis]).toBeCloseTo(before[axis], 1)
		}

		await close()
		expect(opener.firstElementChild).toBe(media)
		expect(query(opener, '.amk-zoom-indicator')).toBe(indicator)
		expect(indicator.checkVisibility()).toBe(true)
		expect(opener.querySelector('[data-amk-preview]')).toBeNull()
		await expect.poll(() => getComputedStyle(indicator).filter).toBe('opacity(1)')
	},
)

it.each(['#builtin', '#captioned'])(
	'hides the %s thumbnail and indicator with its preview disabled',
	async (selector) => {
		const fixture = await mountPage('/zoom-indicator/')
		const opener = query(fixture, `${selector} .amk-zoom`)
		// Image and Picture emit this attribute for zoomPlaceholder="none".
		opener.dataset.placeholder = 'none'
		const photo = query(opener, '[data-zoom-photo]')
		if (photo instanceof HTMLPictureElement) {
			photo.style.display = 'contents'
		}

		const image = query(opener, 'img', HTMLImageElement)
		const { width, height } = image.getBoundingClientRect()
		expect(width).toBeGreaterThan(0)
		const indicator = query(opener, '.amk-zoom-indicator')
		await openLightbox(opener)
		expect(opener.querySelector('[data-amk-preview]')).toBeNull()
		expect(getComputedStyle(image).opacity).toBe('0')
		expect(image.getBoundingClientRect()).toMatchObject({ width, height })
		await expect.poll(() => getComputedStyle(indicator).filter).toBe('opacity(0)')
		await close()
		expect(getComputedStyle(image).opacity).toBe('1')
		await expect.poll(() => getComputedStyle(indicator).filter).toBe('opacity(1)')
	},
)

it('crossfades page indicators as the active overlay item changes', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const items = ['#builtin', '#captioned', '#selector'].map((selector) =>
		query(fixture, `${selector} .amk-zoom`),
	)
	for (const item of items) {
		item.dataset.gallery = 'indicators'
	}

	const indicators = items.map((item) => query(item, '.amk-zoom-indicator'))
	await openLightbox(items[0]!)
	await expect
		.poll(() => indicators.map((indicator) => getComputedStyle(indicator).filter))
		.toEqual(['opacity(0)', 'opacity(1)', 'opacity(1)'])
	await userEvent.keyboard('{ArrowRight}')
	await expect
		.poll(() => indicators.map((indicator) => getComputedStyle(indicator).filter))
		.toEqual(['opacity(1)', 'opacity(0)', 'opacity(1)'])
	await close()
	await expect
		.poll(() => indicators.map((indicator) => getComputedStyle(indicator).filter))
		.toEqual(['opacity(1)', 'opacity(1)', 'opacity(1)'])
})
