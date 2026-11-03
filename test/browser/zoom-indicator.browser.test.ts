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

it('supports size, color, corner positioning, and shared idle/active styling', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const section = query(fixture, '#builtin')
	section.style.cssText =
		'--amk-zoom-indicator-size: 28px; --amk-zoom-indicator-color: rgb(200 20 30); --amk-zoom-indicator-inset: 5px auto auto 7px; --amk-gallery-icon-opacity: .4; --amk-gallery-icon-active-opacity: 1; --amk-gallery-control-transition-duration: 250ms; --amk-gallery-control-active-transition-duration: 0ms;'
	const indicator = query(section, '.amk-zoom-indicator')
	const opener = query(section, '.amk-zoom')
	const style = getComputedStyle(indicator)
	expect(style.width).toBe('28px')
	expect(style.height).toBe('28px')
	expect(style.color).toBe('rgb(200, 20, 30)')
	expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
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
	expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')

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
			await userEvent.hover(query(fixture, '#default'))
		}

		expect(style.transitionDuration).toBe('0.25s')
		expect(
			indicator
				.getAnimations()
				.filter((animation) => animation instanceof CSSTransition)
				.map((animation) => animation.transitionProperty),
		).toEqual(expect.arrayContaining(['color', 'background-color']))
		await expect.poll(() => style.color).toBe('rgb(0, 0, 0)')
		await expect.poll(() => style.backgroundColor).toBe('rgb(255, 255, 255)')
	},
)

it('inherits the rest duration for active states and removes transitions with reduced motion', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const section = query(fixture, '#builtin')
	section.style.cssText =
		'--amk-zoom-indicator-opacity: .4; --amk-zoom-indicator-transition-duration: 250ms;'
	const indicator = query(section, '.amk-zoom-indicator')
	const opener = query(section, '.amk-zoom')
	await userEvent.hover(opener)
	expect(getComputedStyle(indicator).transitionDuration).toBe('0.25s')
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

it('keeps custom decorations inert and outside the lifted media', async () => {
	const fixture = await mountPage('/zoom-indicator/')
	const decoration = query(fixture, '[data-custom-interactive]')
	decoration.focus()
	expect(document.activeElement).not.toBe(decoration)
	const opener = query(fixture, '#builtin .amk-zoom')
	const media = opener.firstElementChild
	const indicator = query(opener, '.amk-zoom-indicator')
	await openLightbox(opener)
	expect(viewer().contains(media)).toBe(true)
	expect(viewer().querySelector('.amk-zoom-indicator')).toBeNull()
	expect(getComputedStyle(indicator).display).toBe('none')
	await close()
	expect(opener.firstElementChild).toBe(media)
	expect(getComputedStyle(indicator).display).toBe('grid')
})
