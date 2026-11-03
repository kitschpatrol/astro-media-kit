import { registerIcons } from '@videojs/html/icons'
import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { disposeCarousels, setUpCarousels } from '../../src/components/internal/carousel/carousel'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import '../../src/components/internal/videojs-audio'
import '../../src/components/internal/videojs-ui'
import { boxes, cleanUp, close, mountPage, query, setUpLightbox, viewer } from './helpers'

setUpLightbox()
afterEach(async () => {
	disposeCarousels()
	await cleanUp()
	document.dispatchEvent(new Event('astro:page-load'))
})

it('shares navigation icons with carousels and restores their defaults after disposal and navigation', async () => {
	const fixture = await mountPage('/media-theme-image/')
	setUpCarousels()
	document.dispatchEvent(new Event('astro:page-load'))
	const carousel = query(fixture, '.amk-carousel')
	const previous = query(carousel, '.amk-carousel-previous')
	const next = query(carousel, '.amk-carousel-next')
	expect(previous.querySelector('[data-custom-icon="carousel-previous"]')).not.toBeNull()
	expect(next.querySelector('[data-custom-icon="carousel-next"]')).not.toBeNull()
	expect(getComputedStyle(next).width).toBe('48px')
	expect(getComputedStyle(next).borderRadius).toBe('8px')
	expect(getComputedStyle(query(next, 'svg', SVGElement)).fill).toBe('rgb(250, 220, 100)')
	expect(getComputedStyle(query(next, 'svg', SVGElement)).width).toBe('28px')
	await userEvent.click(next)
	await expect.poll(() => next.getAttribute('aria-disabled')).toBe('true')
	expect(previous.getAttribute('aria-disabled')).toBe('false')
	carousel.dir = 'rtl'
	expect(getComputedStyle(query(next, '.amk-carousel-icon')).scale).toBe('-1 1')
	disposeCarousels()
	expect(carousel.querySelector('[data-custom-icon]')).toBeNull()
	query(fixture, '[data-amk-media-theme]').remove()
	setUpCarousels()
	document.dispatchEvent(new Event('astro:page-load'))
	expect(carousel.querySelector('[data-custom-icon]')).toBeNull()
	expect(next.querySelector('.amk-carousel-default-icon')).not.toBeNull()
})

it('applies partial overrides to both players and keeps unrelated icon families intact', async () => {
	registerIcons('default', { play: '<svg data-unrelated="true" viewBox="0 0 24 24" />' })
	const fixture = await mountPage('/media-theme/')
	fixture.append(document.createElement('media-icon'))
	query(fixture, 'media-icon:not([family])').setAttribute('name', 'play')
	document.dispatchEvent(new Event('astro:page-load'))
	for (const player of fixture.querySelectorAll('audio-player, video-player')) {
		const play = query(player, 'media-icon[name="play"]')
		await expect.poll(() => play.querySelector('[data-custom-icon="play"]')).not.toBeNull()
		expect(query(player, 'media-icon[name="restart"]').querySelector('svg')).not.toBeNull()
		expect(query(player, 'media-play-button').getAttribute('aria-label')).toBe('Play')
	}

	expect(
		Object.hasOwn(query(fixture, 'media-icon:not([family]) svg', SVGElement).dataset, 'unrelated'),
	).toBe(true)
	const player = query(fixture, 'audio-player')
	const audio = query(player, 'audio', HTMLAudioElement)
	// Keep the UI test independent of platform AAC decoders, particularly Firefox's.
	audio.src = '/media/loop.webm'
	// DOMParser-created media needs an explicit load after mounting.
	audio.load()
	await expect.poll(() => audio.readyState, { timeout: 5000 }).toBeGreaterThan(0)
	await userEvent.click(query(player, 'media-play-button'))
	await expect.poll(() => audio.paused).toBe(false)
	await expect
		.poll(() => query(player, 'media-play-button').getAttribute('aria-label'))
		.toBe('Pause')
	await userEvent.click(query(player, 'media-play-button'))
	await expect.poll(() => audio.paused).toBe(true)
	await userEvent.click(query(player, 'media-mute-button'))
	await expect.poll(() => audio.muted).toBe(true)
	await expect
		.poll(() => query(player, 'media-mute-button').getAttribute('aria-label'))
		.toBe('Unmute')
	await userEvent.click(query(player, 'media-playback-rate-button'))
	await expect.poll(() => query(player, 'media-menu').matches(':popover-open')).toBe(true)
	await expect
		.poll(() =>
			player.querySelector(
				':scope media-menu-radio-item media-icon[name="check"] svg[data-custom-icon="check"]',
			),
		)
		.not.toBeNull()
})

it('reserves the audio bar without showing raw controls while its skin loads', async () => {
	const fixture = await mountPage('/media-theme/')
	const links = fixture.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
	for (const link of links) {
		link.disabled = true
	}

	const skin = query(fixture, 'audio-player media-container')
	expect(getComputedStyle(skin).visibility).toBe('hidden')
	expect(skin.getBoundingClientRect().height).toBe(44)
	for (const link of links) {
		link.disabled = false
	}

	await expect.poll(() => getComputedStyle(skin).visibility).toBe('visible')
})

it('themes lightbox controls, preserves filled artwork, and switches zoom icons with button state', async () => {
	const fixture = await mountPage('/media-theme/')
	document.dispatchEvent(new Event('astro:page-load'))
	await openLightbox(boxes(fixture)[0]!)
	const closeButton = query(viewer(), '.amk-lightbox-close')
	expect(closeButton.getAttribute('aria-label')).toBe('Close')
	expect(closeButton.querySelector('[data-custom-icon="close"]')).not.toBeNull()
	expect(query(viewer(), '.amk-lightbox-next [data-custom-icon="next"]', SVGElement)).toBeDefined()
	expect(
		query(viewer(), '.amk-lightbox-previous svg', SVGElement).classList.contains(
			'amk-lightbox-default-icon',
		),
	).toBe(true)
	expect(getComputedStyle(closeButton).width).toBe('52px')
	expect(getComputedStyle(closeButton).borderRadius).toBe('8px')
	expect(getComputedStyle(query(closeButton, 'svg', SVGElement)).fill).toBe('rgb(250, 220, 100)')
	expect(getComputedStyle(query(closeButton, 'svg', SVGElement)).width).toBe('28px')
	const zoom = query(viewer(), '.amk-lightbox-zoom')
	const zoomIn = query(zoom, '[data-amk-icon="zoom-in"]')
	const zoomOut = query(zoom, '[data-amk-icon="zoom-out"]')
	expect(getComputedStyle(zoomIn).display).toBe('block')
	expect(getComputedStyle(zoomOut).display).toBe('none')
	zoom.click()
	await expect.poll(() => zoom.getAttribute('aria-pressed')).toBe('true')
	expect(getComputedStyle(zoomIn).display).toBe('none')
	expect(getComputedStyle(zoomOut).display).toBe('block')
	await close()
})

it('restores default icons when navigation removes the theme', async () => {
	const fixture = await mountPage('/media-theme/')
	document.dispatchEvent(new Event('astro:page-load'))
	await openLightbox(boxes(fixture)[0]!)
	await close()
	query(fixture, '[data-amk-media-theme]').remove()
	document.dispatchEvent(new Event('astro:page-load'))
	await openLightbox(boxes(fixture)[0]!)
	expect(viewer().querySelector('[data-custom-icon]')).toBeNull()
	for (const player of fixture.querySelectorAll('audio-player, video-player')) {
		expect(player.querySelector('[data-custom-icon]')).toBeNull()
		expect(query(player, 'media-icon[name="play"]').querySelector('svg')).not.toBeNull()
	}
})
