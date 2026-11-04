import { parseHTML } from 'linkedom'
import { requestSignal } from './media'

const WWW_PREFIX_RE = /^www\./v

/** Parsed oEmbed response for a page URL. */
export type OembedInfo = {
	/** Embed height in pixels. `0` if not provided by the oEmbed endpoint. */
	height: number
	/** Raw HTML embed code from the oEmbed provider. */
	html: string
	/** The provider's name, or the page's host name when it gives none. */
	providerName: string
	/** Thumbnail image URL, if the provider supplies one. */
	thumbnailUrl: string | undefined
	/** Media title from the oEmbed response, if available. */
	title: string | undefined
	/** Embed width in pixels. `0` if not provided by the oEmbed endpoint. */
	width: number
}

/**
 * Discovers and fetches oEmbed metadata for a page URL.
 *
 * Follows redirects (e.g. short URLs like dai.ly/ → dailymotion.com/), parses
 * the page HTML for a `<link rel="alternate" type="application/json+oembed">`
 * tag, then fetches the oEmbed JSON endpoint.
 */
export async function fetchOEmbed(pageUrl: string): Promise<OembedInfo> {
	// Step 1: Fetch the page HTML, following redirects.
	const pageResponse = await fetch(pageUrl, { signal: requestSignal() })
	if (!pageResponse.ok) {
		throw new Error(
			`Failed to fetch page "${pageUrl}" (${String(pageResponse.status)}). Provide a direct media file URL or set the "service" prop explicitly.`,
		)
	}

	const canonicalUrl = pageResponse.url
	const html = await pageResponse.text()

	// Step 2: Parse the HTML for the oEmbed discovery link.
	const { document } = parseHTML(html)
	const oembedLink = document.querySelector(
		'link[rel~="alternate"][type="application/json+oembed"]',
	)

	if (!oembedLink) {
		throw new Error(
			`No oEmbed provider found for "${canonicalUrl}". Provide a direct media file URL or set the "service" prop explicitly.`,
		)
	}

	const endpointUrl = oembedLink.getAttribute('href') ?? undefined
	if (endpointUrl === undefined || endpointUrl === '') {
		throw new Error(
			`oEmbed link tag found but has no href for "${canonicalUrl}". Set the "service" prop explicitly.`,
		)
	}

	// Step 3: Fetch the oEmbed JSON response.
	const baseHref = document.querySelector('base[href]')?.getAttribute('href') ?? undefined
	const baseUrl = baseHref === undefined ? canonicalUrl : new URL(baseHref, canonicalUrl)
	const oembedResponse = await fetch(new URL(endpointUrl, baseUrl).href, {
		signal: requestSignal(),
	})
	if (!oembedResponse.ok) {
		throw new Error(
			`oEmbed endpoint request failed (${String(oembedResponse.status)}) for "${canonicalUrl}"`,
		)
	}

	// Some providers send dimensions as strings, and some as CSS lengths, such as
	// SoundCloud's "100%"
	const data = (await oembedResponse.json()) as {
		height?: number | string
		html?: string
		provider_name?: string // eslint-disable-line ts/naming-convention -- oEmbed API field name
		thumbnail_url?: string // eslint-disable-line ts/naming-convention -- oEmbed API field name
		title?: string
		width?: number | string
	}

	if (data.html === undefined || data.html === '') {
		throw new Error(
			`oEmbed response for "${canonicalUrl}" contains no embed HTML. This URL may not support rich/video embeds.`,
		)
	}

	return {
		height: toPixels(data.height),
		html: data.html,
		providerName:
			data.provider_name === undefined || data.provider_name === ''
				? new URL(canonicalUrl).hostname.replace(WWW_PREFIX_RE, '')
				: data.provider_name,
		thumbnailUrl: data.thumbnail_url,
		title: data.title,
		width: toPixels(data.width),
	}
}

/** A dimension in pixels, or `0` for one missing or given in other units. */
function toPixels(value: number | string | undefined): number {
	const pixels = Number(value)
	return Number.isFinite(pixels) && pixels > 0 ? pixels : 0
}

/**
 * Sanitizes oEmbed provider HTML: adds a missing `title` attribute on iframes
 * (for accessibility), removes deprecated attributes (`frameborder`,
 * `scrolling`), and lowercases non-standard attribute names.
 */
export function sanitizeEmbedHtml(html: string, title: string): string {
	const deprecatedAttributes = new Set(['frameborder', 'scrolling'])

	// Wrap in a full document — linkedom only wires `document.body` to the
	// parsed content when the input is a complete HTML document. A bare
	// fragment (or one wrapped in a lone `<body>` tag) parses into a tree
	// where `document.body` is a synthesized empty element, so serializing it
	// silently returns an empty string.
	const { document } = parseHTML(`<html><body>${html}</body></html>`)
	for (const iframe of document.querySelectorAll('iframe')) {
		if (!iframe.hasAttribute('title')) {
			iframe.setAttribute('title', title)
		}

		// Snapshot the attribute list — removing/renaming while iterating the
		// live collection skips entries
		// eslint-disable-next-line unicorn/no-useless-spread -- the copy is intentional, see above
		for (const { name, value } of [...iframe.attributes]) {
			if (deprecatedAttributes.has(name.toLowerCase())) {
				iframe.removeAttribute(name)
			} else if (name !== name.toLowerCase()) {
				iframe.removeAttribute(name)
				iframe.setAttribute(name.toLowerCase(), value)
			}
		}
	}

	return document.body.innerHTML
}
