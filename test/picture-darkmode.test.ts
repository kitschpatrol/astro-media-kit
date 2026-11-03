// Scope: media-kit's <Picture> `darkMode` prop when set to a CSS selector
// string. Regression-guards a bug where a Picture without a dark variant on the
// same page as a Picture with one would disappear once dark mode activated —
// the paired Picture injects a global `<style>` rule (`[selector]
// picture.amk-light{display:none}`) and the solo Picture also carried the
// `amk-light` class, so it got caught by the global rule.

import { beforeAll, describe, expect, it } from 'vitest'
import { buildFixture } from './parity/helpers/build-fixture'

const DARK_RULE =
	/:is\(\[data-theme='dark'\]\) \.amk-picture-[\da-f\-]+>picture\.amk-dark\{display:block\}/v
const LIGHT_RULE =
	/:is\(\[data-theme='dark'\]\) \.amk-picture-[\da-f\-]+>picture\.amk-light\{display:none\}/v

describe('Picture darkMode selector', () => {
	let fx: Awaited<ReturnType<typeof buildFixture>>

	beforeAll(async () => {
		fx = await buildFixture('picture-darkmode')
	})

	describe('media mode fallback formats', () => {
		it('preserves the dark source when preferred formats are empty', async () => {
			const $ = await fx.readHTML('/media-fallback/')
			const picture = $('#empty')
			const sources = picture.find('source')
			expect(sources.length).toBe(1)
			expect(sources.attr('media')).toBe('(prefers-color-scheme: dark)')
			expect(sources.attr('type')).toBe('image/jpeg')
			expect(sources.attr('srcset')).toContain('penguin-dark')
			expect(picture.find('img').attr('src')).toContain('penguin-light')
			expect($('#disabled source').length).toBe(0)
		})

		it('provides a dark fallback after preferred dark formats with responsive sizing', async () => {
			const $ = await fx.readHTML('/media-fallback/')
			const sources = $('#preferred source')
			expect(sources.length).toBe(3)
			expect(sources.eq(0).attr('type')).toBe('image/avif')
			expect(sources.eq(1).attr('media')).toBe('(prefers-color-scheme: dark)')
			expect(sources.eq(1).attr('type')).toBe('image/jpeg')
			expect(sources.eq(1).attr('srcset')).toContain('penguin-dark')
			expect(sources.eq(1).attr('srcset')).toContain('150w')
			expect(sources.eq(1).attr('sizes')).toBe('300px')
			expect(sources.eq(2).attr('media')).toBe('(prefers-color-scheme: light)')
		})

		it('composites the dark background for an opaque fallback behind transparent preferred formats', async () => {
			const $ = await fx.readHTML('/media-fallback/')
			const picture = $('#background')
			const darkFallback = picture.find('source[type="image/jpeg"]')
			expect(darkFallback.length).toBe(1)
			expect(darkFallback.attr('media')).toBe('(prefers-color-scheme: dark)')
			expect(darkFallback.attr('srcset')).not.toBe(picture.find('img').attr('src'))
		})
	})

	describe('selector mode with no dark variant', () => {
		it('renders a plain <picture> without the amk-light class', async () => {
			const $ = await fx.readHTML('/selector-no-dark/')
			const pictures = $('picture')
			expect(pictures.length).toBe(1)
			expect(pictures.hasClass('amk-light')).toBe(false)
			expect(pictures.hasClass('amk-dark')).toBe(false)
		})

		it('does not wrap the <picture> in a paired <div>', async () => {
			const $ = await fx.readHTML('/selector-no-dark/')
			expect($('div:has(> picture.amk-dark):has(> picture.amk-light)').length).toBe(0)
		})

		it('does not inject the dark-mode toggle <style>', async () => {
			const $ = await fx.readHTML('/selector-no-dark/')
			const styles = $('style')
				.map((_, element) => $(element).html() ?? '')
				.toArray()
			expect(styles.some((text) => text.includes('picture.amk-light'))).toBe(false)
			expect(styles.some((text) => text.includes('picture.amk-dark'))).toBe(false)
		})
	})

	describe('selector mode with a dark variant', () => {
		it('wraps both <picture> elements in a <div> and tags them with amk-light / amk-dark', async () => {
			const $ = await fx.readHTML('/selector-with-dark/')
			const wrapper = $('div:has(> picture.amk-dark):has(> picture.amk-light)')
			expect(wrapper.length).toBe(1)
			expect(wrapper.find('> picture.amk-light').length).toBe(1)
			expect(wrapper.find('> picture.amk-dark').length).toBe(1)
		})

		it('injects a <style> that toggles the pair on the configured selector', async () => {
			const $ = await fx.readHTML('/selector-with-dark/')
			const styleText = $('style')
				.map((_, element) => $(element).html() ?? '')
				.toArray()
				.join('\n')
			expect(styleText).toContain('picture.amk-dark{display:none}')
			expect(styleText).toMatch(DARK_RULE)
			expect(styleText).toMatch(LIGHT_RULE)
		})
	})

	describe('selector mode with a transparent image and a dark background only', () => {
		// CSS light-dark() responds only to prefers-color-scheme, so selector-mode
		// dark mode can't use it. For transparent formats with `background` and
		// `backgroundDark` set, Picture must emit a second <picture> that carries
		// the dark inline `background-color`. The image bytes are identical
		// (compositingBackground is a no-op for transparent formats), but the
		// markup carries the toggle.
		it('emits a paired wrapper with light and dark <picture>s carrying different inline background-color', async () => {
			const $ = await fx.readHTML('/selector-transparent-background-dark/')
			const wrapper = $('div:has(> picture.amk-dark):has(> picture.amk-light)')
			expect(wrapper.length).toBe(1)

			const lightImg = wrapper.find('> picture.amk-light img')
			const darkImg = wrapper.find('> picture.amk-dark img')
			expect(lightImg.attr('style')).toContain('background-color:red')
			expect(darkImg.attr('style')).toContain('background-color:blue')
		})

		it('injects the dark-mode toggle <style>', async () => {
			const $ = await fx.readHTML('/selector-transparent-background-dark/')
			const styleText = $('style')
				.map((_, element) => $(element).html() ?? '')
				.toArray()
				.join('\n')
			expect(styleText).toMatch(DARK_RULE)
			expect(styleText).toMatch(LIGHT_RULE)
		})
	})

	describe('selector mode mixing paired and solo pictures on one page', () => {
		// The bug: the solo Picture used to carry `class="amk-light"`, so the global
		// rule injected by the paired Picture would hide it in dark mode. After the
		// fix, the solo Picture renders without that class — proving the global
		// rule cannot match it.
		it('emits exactly one paired wrapper and one bare <picture> with no amk-light class', async () => {
			const $ = await fx.readHTML('/selector-mixed/')

			const wrapper = $('div:has(> picture.amk-dark):has(> picture.amk-light)')
			expect(wrapper.length).toBe(1)

			const bare = $('body > picture')
			expect(bare.length).toBe(1)
			expect(bare.hasClass('amk-light')).toBe(false)
			expect(bare.hasClass('amk-dark')).toBe(false)
		})

		it('the injected dark-mode <style> only targets pictures inside a paired wrapper', async () => {
			const $ = await fx.readHTML('/selector-mixed/')

			// The style exists (the paired Picture emitted it).
			const styleText = $('style')
				.map((_, element) => $(element).html() ?? '')
				.toArray()
				.join('\n')
			expect(styleText).toMatch(LIGHT_RULE)

			// The bare <picture> has no amk-light class, so the rule cannot match it.
			const bare = $('body > picture')
			expect(bare.hasClass('amk-light')).toBe(false)
		})
	})
})
