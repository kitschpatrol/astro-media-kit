import { describe, expect, it } from 'vitest'
import { sanitizeEmbedHtml } from '../src/components/utils/oembed'

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
		expect(result.match(/<iframe/g)).toHaveLength(2)
		expect(result).not.toContain('frameborder')
	})
})
