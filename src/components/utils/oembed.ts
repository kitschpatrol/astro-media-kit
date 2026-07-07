import { parseHTML } from 'linkedom'

/** Parsed oEmbed response for a page URL. */
export type OembedInfo = {
	/** Embed height in pixels. `0` if not provided by the oEmbed endpoint. */
	height: number
	/** Raw HTML embed code from the oEmbed provider. */
	html: string
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
	const pageResponse = await fetch(pageUrl)
	if (!pageResponse.ok) {
		throw new Error(
			`Failed to fetch page "${pageUrl}" (${String(pageResponse.status)}). Provide a direct media file URL or set the "service" prop explicitly.`,
		)
	}

	const canonicalUrl = pageResponse.url
	const html = await pageResponse.text()

	// Step 2: Parse the HTML for the oEmbed discovery link.
	const { document } = parseHTML(html)
	const oembedLink = document.querySelector('link[rel="alternate"][type="application/json+oembed"]')

	if (!oembedLink) {
		throw new Error(
			`No oEmbed provider found for "${canonicalUrl}". Provide a direct media file URL or set the "service" prop explicitly.`,
		)
	}

	const endpointUrl = oembedLink.getAttribute('href')
	if (!endpointUrl) {
		throw new Error(
			`oEmbed link tag found but has no href for "${canonicalUrl}". Set the "service" prop explicitly.`,
		)
	}

	// Step 3: Fetch the oEmbed JSON response.
	const oembedResponse = await fetch(endpointUrl)
	if (!oembedResponse.ok) {
		throw new Error(
			`oEmbed endpoint request failed (${String(oembedResponse.status)}) for "${canonicalUrl}"`,
		)
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion -- oEmbed JSON shape is well-known
	const data = (await oembedResponse.json()) as {
		height?: number
		html?: string
		thumbnail_url?: string // eslint-disable-line ts/naming-convention -- oEmbed API field name
		title?: string
		width?: number
	}

	if (!data.html) {
		throw new Error(
			`oEmbed response for "${canonicalUrl}" contains no embed HTML. This URL may not support rich/video embeds.`,
		)
	}

	return {
		height: data.height ?? 0,
		html: data.html,
		thumbnailUrl: data.thumbnail_url,
		title: data.title,
		width: data.width ?? 0,
	}
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
