import { parseHTML } from 'linkedom'

export type OembedInfo = {
	height: number
	html: string
	thumbnailUrl: string | undefined
	title: string | undefined
	width: number
}

/**
 * Discovers and fetches oEmbed metadata for a page URL.
 *
 * Follows redirects (e.g. short URLs like dai.ly/ → dailymotion.com/),
 * parses the page HTML for a `<link rel="alternate" type="application/json+oembed">` tag,
 * then fetches the oEmbed JSON endpoint.
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
