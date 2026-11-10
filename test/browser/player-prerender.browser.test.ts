// What a player shows from its markup and stylesheet alone, before any of its
// scripts run. No Video.js module is imported here, so nothing upgrades.

import { afterEach, expect, it } from 'vitest'
import { cleanUp, mountPage, query } from './helpers'

afterEach(cleanUp)

it('shows the poster, the icons, and the times before the player runs', async () => {
	const fixture = await mountPage('/zoom/')
	expect(customElements.get('video-player')).toBeUndefined()
	expect(customElements.get('media-time')).toBeUndefined()
	const player = query(fixture, '#video video-player')

	const poster = query(player, 'media-poster')
	const image = query(poster, 'img', HTMLImageElement)
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true)
	expect(getComputedStyle(poster).opacity).toBe('1')
	const container = query(player, 'media-container').getBoundingClientRect()
	const drawn = image.getBoundingClientRect()
	expect(drawn.width).toBeCloseTo(container.width, 0)
	expect(drawn.height).toBeCloseTo(container.height, 0)

	const button = query(player, '.amk-bar media-play-button')
	expect(getComputedStyle(query(button, '.amk-icon-play')).display).toBe('block')
	expect(getComputedStyle(query(button, '.amk-icon-pause')).display).toBe('none')
	expect(
		query(button, '.amk-icon-play svg', SVGElement).getBoundingClientRect().width,
	).toBeGreaterThan(0)

	const current = query(player, 'media-time[type="current"]')
	const duration = query(player, 'media-time[type="duration"]')
	expect(getComputedStyle(current, '::before').content).toBe('"0:00"')
	expect(getComputedStyle(duration, '::before').content).toBe('"1:15"')
	expect(getComputedStyle(query(player, 'media-time-separator'), '::before').content).toBe('"/"')
	// A player this narrow leaves the duration out, so measure the current time
	expect(getComputedStyle(current, '::before').fontSize).toBe('14px')
	expect(current.getBoundingClientRect().width).toBeGreaterThan(0)
	// Nothing waits behind a spinner or an error that no script has asked for
	expect(getComputedStyle(query(player, '.amk-buffering')).opacity).toBe('0')

	// The page was rendered with a muted video, and with no captions it knows of
	const mute = query(player, 'amk-mute-button')
	expect(getComputedStyle(query(mute, '.amk-icon-volume-off')).display).toBe('block')
	expect(getComputedStyle(query(mute, '.amk-icon-volume-high')).display).toBe('none')
	expect(getComputedStyle(query(player, 'media-captions-button')).display).toBe('none')
})

it('shows the audio bar with its icons, and no popups, before the player runs', async () => {
	const fixture = await mountPage('/audio-startup/')
	expect(customElements.get('audio-player')).toBeUndefined()
	const player = query(fixture, '#playable audio-player')
	await expect
		.poll(() => getComputedStyle(query(player, 'media-container')).visibility)
		.toBe('visible')
	for (const name of ['play', 'seek', 'volume-high']) {
		const icon = query(player, `[data-amk-icon="${name}"] svg`, SVGElement)
		expect(icon.getBoundingClientRect().width).toBeGreaterThan(0)
	}

	for (const popup of player.querySelectorAll(
		'media-tooltip, media-menu, media-volume-popover, media-slider-preview',
	)) {
		expect(getComputedStyle(popup).display).toBe('none')
	}

	expect(getComputedStyle(query(player, 'media-playback-rate-button'), '::after').content).toBe(
		'"1×"',
	)
})
