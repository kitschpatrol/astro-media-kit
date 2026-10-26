import { setVideoSourceWhenReady, VIDEO_ELEMENT_SELECTOR } from './video-source'

let pageController = new AbortController()
let pending = new WeakSet<HTMLElement>()

/** Assign the sources of the media in `root` that is still waiting for one. */
async function initializeMedia(root: ParentNode = document): Promise<void> {
	const { signal } = pageController
	await Promise.all(
		Array.from(root.querySelectorAll<HTMLElement>(VIDEO_ELEMENT_SELECTOR), async (element) => {
			if (!Object.hasOwn(element.dataset, 'src') || pending.has(element)) {
				return
			}

			pending.add(element)
			if (element.localName.includes('-')) {
				await customElements.whenDefined(element.localName)
			}

			if (element.closest('video-player')) {
				await customElements.whenDefined('video-player')
			}

			if (signal.aborted || !element.isConnected) {
				return
			}

			const cleanup = setVideoSourceWhenReady(
				element,
				element.dataset.src ?? '',
				element.dataset.hlsOptions,
			)
			signal.addEventListener('abort', cleanup, { once: true })
		}),
	)
}

void initializeMedia()
document.addEventListener('astro:page-load', () => {
	void initializeMedia()
})
// The lightbox announces media it adds to the page after load, from a text
// link's template
document.addEventListener('amk-media-connected', (event) => {
	if (event.target instanceof Element) {
		void initializeMedia(event.target)
	}
})
document.addEventListener('astro:before-swap', () => {
	pageController.abort()
	pageController = new AbortController()
	pending = new WeakSet()
})
