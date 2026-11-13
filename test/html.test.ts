import { parseHTML } from 'linkedom'
import { describe, expect, it } from 'vitest'
import { escapeAttributeValues } from '../src/components/utils/html'

function roundTrip(html: string): string {
	const { document } = parseHTML(`<html><body>${html}</body></html>`)
	escapeAttributeValues(document.body)
	return document.body.innerHTML
}

describe('escapeAttributeValues', () => {
	it('writes attribute values back as they were written', () => {
		const html =
			'<img alt="&amp;copy; &quot;quoted&quot; &amp;lt;b&amp;gt;" src="/a?x=1&amp;y=2"><p title="Terms &amp; conditions">Text &amp;copy; &lt;b&gt;</p>'
		expect(roundTrip(html)).toBe(html)
	})

	it('escapes angle brackets, which could close a noscript from inside an attribute', () => {
		const html = '<noscript><img alt="&lt;/noscript&gt;&lt;img src=x&gt;"></noscript>'
		expect(roundTrip(html)).toBe(html)
	})

	it('reaches the content of templates, nested ones included', () => {
		const html =
			'<a href="#">Link<template><img alt="&amp;copy;"><template><b title="&amp;amp;"></b></template></template></a>'
		expect(roundTrip(html)).toBe(html)
	})

	it('leaves scripts, styles, and text alone', () => {
		const html = '<script>a && b</script><style>a > b { content: "&" }</style><p>a &amp; b</p>'
		expect(roundTrip(html)).toBe(html)
	})
})
