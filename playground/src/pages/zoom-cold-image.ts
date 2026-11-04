import type { APIRoute } from 'astro'
import { getImage } from 'astro:assets'
import photo from '../assets/test.jpeg'

// Serve bytes on every request: redirecting to a shared asset could reuse cache.
export const prerender = false

export const GET: APIRoute = async ({ request }) => {
	const image = await getImage({ format: 'webp', src: photo, width: photo.width })
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
