import { afterEach, expect, it } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import videoStyles from '../../src/components/internal/amk-video.css?inline'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import { installZoomIndicators } from '../../src/components/internal/zoom-indicator'
import { cleanUp, close, mount, mountPage, query, setUpLightbox, viewer } from './helpers'

setUpLightbox()
installZoomIndicators()
afterEach(async () => {
	document.dispatchEvent(new Event('astro:before-swap'))
	await cleanUp()
	document.dispatchEvent(new Event('astro:page-load'))
})

it('themes builtin indicators while preserving local slots and restores defaults on navigation', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	document.dispatchEvent(new Event('astro:page-load'))
	expect(
		fixture.querySelector(':scope #builtin [data-custom-icon="global-indicator"]'),
	).not.toBeNull()
	expect(
		fixture.querySelector(':scope #custom [data-custom-icon="local-indicator"]'),
	).not.toBeNull()
	query(fixture, '[data-amk-media-theme]').remove()
	document.dispatchEvent(new Event('astro:page-load'))
	expect(fixture.querySelector(':scope #builtin [data-custom-icon]')).toBeNull()
	expect(fixture.querySelector(':scope #builtin .amk-zoom-indicator svg')).not.toBeNull()
	expect(
		fixture.querySelector(':scope #custom [data-custom-icon="local-indicator"]'),
	).not.toBeNull()
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
	const icon = getComputedStyle(query(indicator, 'svg'))
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
	expect(getComputedStyle(query(indicator, 'svg')).width).toBe('16px')
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
		if (interaction === 'focus') {
			opener.blur()
		} else {
			await userEvent.hover(query(fixture, '#default .amk-zoom'))
		}

		expect(style.transitionDuration).toBe('0.25s')
		const transitions = indicator
			.getAnimations()
			.filter((animation) => animation instanceof CSSTransition)
		const properties = transitions.map((animation) => animation.transitionProperty)
		// Native background-color transitions can flash a stale composited fill in Chromium.
		expect(properties).not.toContain('background-color')
		expect(properties).toEqual(
			expect.arrayContaining(['color', '--amk-zoom-indicator-painted-background']),
		)
		const background = transitions.find(
			(animation) => animation.transitionProperty === '--amk-zoom-indicator-painted-background',
		)!
		expect(background.effect!.getTiming().duration).toBe(250)
		background.pause()
		background.currentTime = 125
		// The registered color must interpolate, preserving the public background styling.
		expect(style.backgroundColor).not.toBe('rgb(0, 0, 0)')
		expect(style.backgroundColor).not.toBe('rgb(255, 255, 255)')
		background.play()
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

it('keeps custom decorations inert', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const decoration = query(fixture, '[data-custom-interactive]')
	decoration.focus()
	expect(document.activeElement).not.toBe(decoration)
})

it.each(['#builtin', '#custom', '#selector'])(
	'fades the %s indicator on its page thumbnail while its media is active in the overlay',
	async (selector) => {
		const fixture = await mountPage('/zoom-indicator/')
		const opener = query(fixture, `${selector} .amk-zoom`)
		opener.scrollIntoView()
		const media = opener.firstElementChild
		const indicator = query(opener, '.amk-zoom-indicator')
		const before = indicator.getBoundingClientRect()
		await openLightbox(opener)
		expect(viewer().contains(media)).toBe(true)
		expect(viewer().querySelector('.amk-zoom-indicator')).toBeNull()
		expect(query(opener, '[data-preview]')).toBeDefined()
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
		expect(opener.querySelector('[data-preview]')).toBeNull()
		await expect.poll(() => getComputedStyle(indicator).filter).toBe('opacity(1)')
	},
)

it('fades the indicator with an explicitly disabled thumbnail preview', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const opener = query(fixture, '#builtin .amk-zoom')
	// Image and Picture emit this attribute for zoomPlaceholder="none".
	opener.dataset.placeholder = 'none'
	const indicator = query(opener, '.amk-zoom-indicator')
	await openLightbox(opener)
	expect(opener.querySelector('[data-preview]')).toBeNull()
	await expect.poll(() => getComputedStyle(indicator).filter).toBe('opacity(0)')
	await close()
	await expect.poll(() => getComputedStyle(indicator).filter).toBe('opacity(1)')
})

it('crossfades page indicators as the active overlay item changes', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const items = ['#builtin', '#custom', '#selector'].map((selector) =>
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
