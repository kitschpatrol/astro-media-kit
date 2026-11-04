import type { APIRoute } from 'astro'
import { getImage } from 'astro:assets'
import darkPhoto from '../assets/test-dark.jpeg'
import photo from '../assets/test.jpeg'

// Serve bytes on every request: redirecting to a shared asset could reuse cache.
export const prerender = false

export const GET: APIRoute = async ({ request }) => {
	const source = new URL(request.url).searchParams.get('variant') === 'dark' ? darkPhoto : photo
	const image = await getImage({ format: 'webp', src: source, width: source.width })
	const [response] = await Promise.all([
		fetch(new URL(image.src, request.url)),
		new Promise<void>((resolve) => {
			setTimeout(resolve, 3000)
		}),
	])

	return new Response(response.body, {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': response.headers.get('Content-Type') ?? 'image/webp',
		},
		status: response.status,
	})
}
