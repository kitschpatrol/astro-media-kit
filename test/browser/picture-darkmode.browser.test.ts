import { afterEach, expect, it } from 'vitest'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import { cleanUp, currentLayer, frames, mountPage, query, setUpLightbox } from './helpers'

setUpLightbox()
afterEach(cleanUp)

it('selects the native SVG source when a static build emits no resized variants', async () => {
	const page = await mountPage('/responsive-svg/')
	const image = query(page, '#vector-source img', HTMLImageElement)
	image.loading = 'eager'
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true)
	expect(image.src.endsWith('.png')).toBe(true)
	expect(image.currentSrc.endsWith('.svg')).toBe(true)
})

it('keeps Pictures with different dark selectors independent', async () => {
	const page = await mountPage('/picture-selectors/')
	const themes = query(page, '#themes')
	for (const [theme, active, inactive] of [
		['first-theme', 'first', 'second'],
		['second-theme', 'second', 'first'],
	]) {
		themes.className = theme!
		expect(getComputedStyle(query(page, `#${active} .amk-dark`)).display).toBe('block')
		expect(getComputedStyle(query(page, `#${active} .amk-light`)).display).toBe('none')
		expect(getComputedStyle(query(page, `#${inactive} .amk-dark`)).display).toBe('none')
		expect(getComputedStyle(query(page, `#${inactive} .amk-light`)).display).not.toBe('none')
	}
})

it('groups selector lists without hiding the matching theme container', async () => {
	const page = await mountPage('/picture-selectors/')
	const themes = query(page, '#themes')
	for (const theme of ['first-theme', 'second-theme']) {
		themes.className = theme
		expect(getComputedStyle(themes).display).not.toBe('none')
		expect(getComputedStyle(query(page, '#both .amk-dark')).display).toBe('block')
		expect(getComputedStyle(query(page, '#both .amk-light')).display).toBe('none')
	}

	themes.className = ''
	expect(getComputedStyle(query(page, '#both .amk-dark')).display).toBe('none')
	expect(getComputedStyle(query(page, '#both .amk-light')).display).not.toBe('none')
})

it.each(['first', 'second', 'both'])(
	'keeps the selected %s picture variant in the viewer as its page theme changes',
	async (id) => {
		const page = await mountPage('/picture-selectors/')
		const themes = query(page, '#themes')
		const pair = query(page, `#${id}`)
		const item = pair.closest<HTMLElement>('.amk-zoom')!
		const dark = query(pair, '.amk-dark')
		const light = query(pair, '.amk-light')
		for (const theme of ['', 'first-theme', 'second-theme']) {
			themes.className = theme
			const isDark = getComputedStyle(dark).display !== 'none'
			const styles = [dark.getAttribute('style'), light.getAttribute('style')]
			await openLightbox(item)
			const viewedDark = query(currentLayer(), '.amk-dark')
			const viewedLight = query(currentLayer(), '.amk-light')
			expect(getComputedStyle(viewedDark).display !== 'none').toBe(isDark)
			expect(getComputedStyle(viewedLight).display === 'none').toBe(isDark)
			// Theme changes in the original container still reach the lifted pair.
			themes.className = theme === '' ? 'first-theme' : ''
			const nextIsDark = id !== 'second' && themes.className !== ''
			await expect.poll(() => getComputedStyle(viewedDark).display !== 'none').toBe(nextIsDark)
			expect(getComputedStyle(viewedLight).display === 'none').toBe(nextIsDark)
			await closeLightbox(true)
			await frames()
			expect([dark.getAttribute('style'), light.getAttribute('style')]).toEqual(styles)
			expect(getComputedStyle(dark).display !== 'none').toBe(nextIsDark)
		}
	},
)

it('follows document theme changes while preserving author styles on return', async () => {
	const page = await mountPage('/picture-selectors/')
	const pair = query(page, '#first')
	const item = pair.closest<HTMLElement>('.amk-zoom')!
	const dark = query(pair, '.amk-dark')
	const light = query(pair, '.amk-light')
	dark.style.setProperty('display', 'none', 'important')
	light.style.color = 'red'
	const styles = [dark.getAttribute('style'), light.getAttribute('style')]
	try {
		await openLightbox(item)
		const viewedDark = query(currentLayer(), '.amk-dark')
		const viewedLight = query(currentLayer(), '.amk-light')
		document.documentElement.classList.add('first-theme')
		await expect.poll(() => getComputedStyle(viewedDark).display !== 'none').toBe(true)
		expect(getComputedStyle(viewedLight).display).toBe('none')
		document.documentElement.classList.remove('first-theme')
		await expect.poll(() => getComputedStyle(viewedLight).display !== 'none').toBe(true)
		await closeLightbox(true)
		await frames()
		expect([dark.getAttribute('style'), light.getAttribute('style')]).toEqual(styles)
	} finally {
		await closeLightbox(true)
		document.documentElement.classList.remove('first-theme')
	}
})
