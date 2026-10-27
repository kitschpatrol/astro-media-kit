import { load } from 'cheerio'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

const whitespacePattern = /\s+/v
const assetPattern = /^\/_astro\//v

describe('zoom server markup', () => {
	let fixture: Awaited<ReturnType<typeof buildFixture>>
	beforeAll(async () => {
		fixture = await buildFixture('core-image')
	})

	it('links to the largest generated fallback candidate and renders its width as the native size', async () => {
		const $ = await fixture.readHTML('/zoom/')
		const link = $('#first a.amk-zoom').first()
		const candidates = link
			.find('img')
			.attr('srcset')!
			.split(',')
			.map((entry) => entry.trim().split(whitespacePattern))
		const largest = candidates.toSorted(
			(a, b) => Number(b[1]!.slice(0, -1)) - Number(a[1]!.slice(0, -1)),
		)[0]!
		expect(link.attr('href')).toBe(largest[0])
		expect(link.attr('href')).toMatch(assetPattern)
		expect(link.attr('data-native-width')).toBe(largest[1]!.slice(0, -1))
		expect(link.attr('data-gallery')).toBe('trip')
		expect(link.attr('data-level')).toBe('native')
		expect(link.attr('data-scope')).toBe('article')
		expect(link.parent('figure').children('figcaption').text()).toContain('Picture caption')
	})

	it('renders link and button semantics on the server, and omits default values', async () => {
		const $ = await fixture.readHTML('/zoom/')
		const link = $('#first a.amk-zoom').first()
		expect(link.attr('role')).toBeUndefined()
		expect(link.attr('tabindex')).toBeUndefined()
		expect(link.attr('aria-haspopup')).toBeUndefined()
		const image = $('#first a.amk-zoom').last()
		expect(image.attr('data-level')).toBeUndefined()
		expect(image.attr('data-placeholder')).toBeUndefined()

		const content = $('#content .amk-zoom')
		expect(content.prop('tagName')).toBe('DIV')
		expect(content.attr('role')).toBe('button')
		expect(content.attr('tabindex')).toBe('0')
		expect(content.attr('aria-haspopup')).toBe('dialog')
		expect(content.attr('data-zoom-interactive')).toBeUndefined()
	})

	it('keeps the real player and its controls, marking the wrapper interactive', async () => {
		const $ = await fixture.readHTML('/zoom/')
		const player = $('#video .amk-zoom')
		expect(player.attr('data-zoom-interactive')).toBe('')
		expect(player.attr('role')).toBeUndefined()
		expect(player.attr('tabindex')).toBeUndefined()
		expect($('#video video-player')).toHaveLength(1)
		expect($('#video template')).toHaveLength(0)
		expect($('#video media-container').attr('data-media')).toBe('')
		expect($('#video media-controls').attr('data-interactive')).toBe('')
		expect($('#video button[data-zoom-open]')).toHaveLength(1)
		expect($('#video button[data-zoom-open] media-icon')).toHaveLength(1)
	})

	it('renders the full bar for a minimal player the lightbox can raise, and the volume in a popover', async () => {
		const $ = await fixture.readHTML('/zoom/')
		expect($('#video-minimal .amk-player').attr('data-controls')).toBe('minimal')
		expect($('#video-minimal .amk-center-play')).toHaveLength(1)
		expect($('#video-minimal .amk-playback media-play-button')).toHaveLength(1)
		expect($('#video-background .amk-center-play')).toHaveLength(1)
		expect($('#video-background .amk-playback')).toHaveLength(0)
		expect($('#video-background media-fullscreen-button')).toHaveLength(0)
		expect($('#video-background media-hotkey[action="toggleFullscreen"]')).toHaveLength(0)
		expect($('#video-background media-gesture[action="togglePaused"]')).toHaveLength(1)
		expect($('#video-minimal [data-zoom-open]')).toHaveLength(1)
		expect($('#video-minimal media-fullscreen-button')).toHaveLength(0)
		expect($('#video .amk-center-play')).toHaveLength(0)
		const popover = $('#video media-volume-popover')
		expect(popover.attr('open-on-hover')).toBeDefined()
		expect($('#video amk-mute-button').attr('commandfor')).toBe(popover.attr('id'))
		expect(popover.find('media-volume-slider').attr('orientation')).toBe('vertical')
		expect($('#video .amk-bar > media-volume-slider')).toHaveLength(0)
	})

	it('offers only lightbox expansion when playback controls are disabled and zoom is enabled', async () => {
		const $ = await fixture.readHTML('/zoom/')
		expect($('#video-zoom-only [data-zoom-open]')).toHaveLength(1)
		expect($('#video-zoom-only media-play-button')).toHaveLength(0)
		expect($('#video-zoom-only media-fullscreen-button')).toHaveLength(0)
		expect($('#video-zoom-only media-hotkey')).toHaveLength(0)
		expect($('#video-no-controls media-controls')).toHaveLength(0)
	})

	it('falls back to a native video at the player size without JavaScript', async () => {
		const $ = await fixture.readHTML('/zoom/')
		const noscript = $('#video .amk > noscript')
		expect(noscript).toHaveLength(1)
		const fallback = load(noscript.text())('video')
		expect(fallback.is('[controls]')).toBe(true)
		expect(fallback.attr('style')).toBe('width: 640px; aspect-ratio: 16 / 9')
		expect(fallback.find('source').attr('src')).toBe('/media/loop.mp4')
	})

	it('marks both themed pictures as media, and skips the wrapper when zoom is off', async () => {
		const $ = await fixture.readHTML('/zoom/')
		expect($('#second .amk-zoom > .amk-picture > picture')).toHaveLength(2)
		expect($('#second .amk-picture img[data-media]')).toHaveLength(2)
		expect($('#second .amk-dark img').attr('alt')).toBe('Themed picture')
		expect($('#first picture img[data-media]')).toHaveLength(0)
		expect($('#disabled .amk-zoom')).toHaveLength(0)
	})

	it('ships the lightbox script only on pages with a zoom-enabled component', async () => {
		const zoomed = await fixture.readHTML('/zoom/')
		const plain = await fixture.readHTML('/local-basic/')
		expect(zoomed('script[type="module"]').length).toBeGreaterThan(0)
		expect(plain('script[type="module"]')).toHaveLength(0)
	})
})
