import { afterEach, expect, it } from 'vitest'
import { cleanUp, mountPage, query } from './helpers'

afterEach(cleanUp)

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
