import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOEmbed, sanitizeEmbedHtml } from '../src/components/utils/oembed'

/**
 * Answer the page request, landing on `pageUrl`, with a link to an oEmbed
 * endpoint, and then the endpoint request with `data`.
 */
function stubProvider(pageUrl: string, data: Record<string, unknown>): void {
	const page = new Response(
		'<link rel="alternate" type="application/json+oembed" href="https://provider.example/oembed">',
	)
	Object.defineProperty(page, 'url', { value: pageUrl })
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(Response.json(data)),
	)
}

describe('fetchOEmbed', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('reads sizes sent as numbers or numeric strings', async () => {
		stubProvider('https://www.ted.com/talks/x', {
			height: '480',
			html: '<iframe></iframe>',
			provider_name: 'TED', // eslint-disable-line ts/naming-convention -- oEmbed API field name
			width: 854,
		})
		const info = await fetchOEmbed('https://www.ted.com/talks/x')
		expect(info.width).toBe(854)
		expect(info.height).toBe(480)
		expect(info.providerName).toBe('TED')
	})

	it('drops sizes in other units, so they never become an aspect ratio', async () => {
		stubProvider('https://soundcloud.com/a/b', {
			height: 400,
			html: '<iframe></iframe>',
			width: '100%',
		})
		const info = await fetchOEmbed('https://soundcloud.com/a/b')
		expect(info.width).toBe(0)
		expect(info.height).toBe(400)
	})

	it('names the provider by the page host when the response does not', async () => {
		stubProvider('https://www.example.com/watch/1', { html: '<iframe></iframe>' })
		const info = await fetchOEmbed('https://short.example/1')
		expect(info.providerName).toBe('example.com')
		expect(info.width).toBe(0)
	})

	it.each([
		['/oembed?item=1', '', 'https://provider.example/oembed?item=1'],
		['../oembed?item=1', '', 'https://provider.example/oembed?item=1'],
		['//api.example/oembed', '', 'https://api.example/oembed'],
		['oembed', '<base href="/api/">', 'https://provider.example/api/oembed'],
	])(
		'resolves discovery URL %s against the redirected page and its base',
		async (href, base, expected) => {
			const page = new Response(
				`${base}<link rel="alternate stylesheet" type="application/json+oembed" href="${href}">`,
			)
			Object.defineProperty(page, 'url', { value: 'https://provider.example/watch/1' })
			const fetch = vi
				.fn()
				.mockResolvedValueOnce(page)
				.mockResolvedValueOnce(Response.json({ html: '<iframe></iframe>' }))
			vi.stubGlobal('fetch', fetch)

			await fetchOEmbed('https://short.example/1')
			expect(fetch).toHaveBeenNthCalledWith(2, expected)
		},
	)
})

describe('sanitizeEmbedHtml', () => {
	it('preserves the embed content (regression: linkedom fragment parsing returned an empty body)', () => {
		const html = '<iframe src="https://embed.ted.com/talks/x" width="560" height="315"></iframe>'
		const result = sanitizeEmbedHtml(html, 'A talk')
		expect(result).toContain('<iframe')
		expect(result).toContain('src="https://embed.ted.com/talks/x"')
	})

	it('adds a title to iframes that lack one', () => {
		const result = sanitizeEmbedHtml(
			'<iframe src="https://example.com/embed"></iframe>',
			'My video',
		)
		expect(result).toContain('title="My video"')
	})

	it('keeps an existing iframe title', () => {
		const result = sanitizeEmbedHtml(
			'<iframe src="https://example.com/embed" title="Original"></iframe>',
			'Fallback',
		)
		expect(result).toContain('title="Original"')
		expect(result).not.toContain('Fallback')
	})

	it('removes deprecated frameborder and scrolling attributes', () => {
		const result = sanitizeEmbedHtml(
			'<iframe src="https://example.com/embed" title="T" frameborder="0" scrolling="no"></iframe>',
			'T',
		)
		expect(result).not.toContain('frameborder')
		expect(result).not.toContain('scrolling')
		expect(result).toContain('src="https://example.com/embed"')
	})

	it('lowercases non-standard attribute names', () => {
		const result = sanitizeEmbedHtml(
			'<iframe src="https://example.com/embed" title="T" allowFullScreen="true"></iframe>',
			'T',
		)
		expect(result).toContain('allowfullscreen="true"')
		expect(result).not.toContain('allowFullScreen')
	})

	it('preserves surrounding non-iframe content', () => {
		const result = sanitizeEmbedHtml(
			'<iframe src="https://example.com/embed" title="T"></iframe><p>Attribution</p>',
			'T',
		)
		expect(result).toContain('<p>Attribution</p>')
	})

	it('passes through markup with no iframes', () => {
		const html = '<blockquote class="tweet">Some quote</blockquote>'
		expect(sanitizeEmbedHtml(html, 'T')).toBe(html)
	})

	it('handles multiple iframes', () => {
		const result = sanitizeEmbedHtml(
			'<iframe src="https://a.example/1" frameborder="0"></iframe><iframe src="https://a.example/2" frameborder="0"></iframe>',
			'T',
		)
		expect(result.match(/<iframe/gv)).toHaveLength(2)
		expect(result).not.toContain('frameborder')
	})
})
