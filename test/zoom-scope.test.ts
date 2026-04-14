// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveScopedGalleries } from '../src/components/utils/zoom-scope'

const SCOPE_SUFFIX_PATTERN = /^album__scope_\d+$/

/** Build a `.pswp-zoom` element with optional data attributes. */
function zoomElement(
	options: {
		gallery?: string
		scope?: string
	} = {},
): HTMLElement {
	const element = document.createElement('a')
	element.classList.add('pswp-zoom')
	if (options.gallery !== undefined) element.dataset.pswpGallery = options.gallery
	if (options.scope !== undefined) element.dataset.pswpScope = options.scope
	return element
}

afterEach(() => {
	document.body.innerHTML = ''
})

describe('resolveScopedGalleries', () => {
	it('groups items under the same ancestor with matching suffixes', () => {
		document.body.innerHTML = `<section class="hero"></section>`
		const section = document.querySelector('.hero')!
		const a = zoomElement({ gallery: 'album', scope: '.hero' })
		const b = zoomElement({ gallery: 'album', scope: '.hero' })
		section.append(a, b)

		resolveScopedGalleries()

		expect(a.dataset.pswpGallery).toBe('album__scope_0')
		expect(b.dataset.pswpGallery).toBe('album__scope_0')
	})

	it('splits the same gallery name across different ancestors', () => {
		document.body.innerHTML = `
			<section class="hero" id="s1"></section>
			<section class="hero" id="s2"></section>
		`
		const s1 = document.querySelector('#s1')!
		const s2 = document.querySelector('#s2')!
		const a = zoomElement({ gallery: 'album', scope: '.hero' })
		const b = zoomElement({ gallery: 'album', scope: '.hero' })
		s1.append(a)
		s2.append(b)

		resolveScopedGalleries()

		expect(a.dataset.pswpGallery).not.toBe(b.dataset.pswpGallery)
		expect(a.dataset.pswpGallery).toMatch(SCOPE_SUFFIX_PATTERN)
		expect(b.dataset.pswpGallery).toMatch(SCOPE_SUFFIX_PATTERN)
	})

	it('assigns synthetic name for standalone zoom with scope', () => {
		document.body.innerHTML = `<section class="hero"></section>`
		const section = document.querySelector('.hero')!
		const a = zoomElement({ scope: '.hero' })
		const b = zoomElement({ scope: '.hero' })
		section.append(a, b)

		resolveScopedGalleries()

		expect(a.dataset.pswpGallery).toBe('__scoped__scope_0')
		expect(b.dataset.pswpGallery).toBe('__scoped__scope_0')
	})

	it('does not affect elements without data-pswp-scope', () => {
		document.body.innerHTML = `<section class="hero"></section>`
		const section = document.querySelector('.hero')!
		const scoped = zoomElement({ gallery: 'album', scope: '.hero' })
		const unscoped = zoomElement({ gallery: 'album' })
		section.append(scoped, unscoped)

		resolveScopedGalleries()

		expect(scoped.dataset.pswpGallery).toBe('album__scope_0')
		expect(unscoped.dataset.pswpGallery).toBe('album')
	})

	it('warns and skips when scope selector matches no ancestor', () => {
		// eslint-disable-next-line ts/no-empty-function -- suppress warn output during test
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const element = zoomElement({ gallery: 'album', scope: '.nonexistent' })
		document.body.append(element)

		resolveScopedGalleries()

		expect(element.dataset.pswpGallery).toBe('album')
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('zoomScope ".nonexistent" matched no ancestor'),
		)
		warn.mockRestore()
	})

	it('handles nested scopes (resolves to nearest matching ancestor)', () => {
		document.body.innerHTML = `
			<div class="outer">
				<div class="inner"></div>
			</div>
		`
		const inner = document.querySelector('.inner')!
		const element = zoomElement({ gallery: 'album', scope: '.inner' })
		inner.append(element)

		resolveScopedGalleries()

		expect(element.dataset.pswpGallery).toBe('album__scope_0')
	})

	it('is a no-op when no scoped elements exist', () => {
		const a = zoomElement({ gallery: 'album' })
		const b = zoomElement()
		document.body.append(a, b)

		resolveScopedGalleries()

		expect(a.dataset.pswpGallery).toBe('album')
		expect(b.dataset.pswpGallery).toBeUndefined()
	})

	it('accepts a custom root node', () => {
		const container = document.createElement('div')
		container.innerHTML = `<section class="hero"></section>`
		const section = container.querySelector('.hero')!
		const element = zoomElement({ gallery: 'g', scope: '.hero' })
		section.append(element)
		// Not attached to document.body

		resolveScopedGalleries(container)

		expect(element.dataset.pswpGallery).toBe('g__scope_0')
	})
})
