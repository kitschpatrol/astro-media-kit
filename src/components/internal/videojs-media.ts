import { setMediaSourceWhenReady, VIDEO_ELEMENT_SELECTOR } from './video-source'

let pageController = new AbortController()
let pending = new WeakSet<HTMLElement>()

/** Assign the sources of the media in `root` that is still waiting for one. */
async function initializeMedia(root: ParentNode = document): Promise<void> {
	const { signal } = pageController
	await Promise.all(
		Array.from(
			root.querySelectorAll<HTMLElement>(`audio, ${VIDEO_ELEMENT_SELECTOR}`),
			async (element) => {
				if (!Object.hasOwn(element.dataset, 'src') || pending.has(element)) {
					return
				}

				pending.add(element)
				if (element.localName.includes('-')) {
					await customElements.whenDefined(element.localName)
				}

				const player = element.closest('audio-player, video-player')
				if (player) {
					await customElements.whenDefined(player.localName)
				}

				if (signal.aborted || !element.isConnected) {
					return
				}

				const cleanup = setMediaSourceWhenReady(
					element,
					element.dataset.src ?? '',
					element.dataset.hlsOptions,
				)
				signal.addEventListener('abort', cleanup, { once: true })
			},
		),
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
