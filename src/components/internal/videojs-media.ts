import { setVideoSourceWhenReady, VIDEO_ELEMENT_SELECTOR } from './video-source'

let pageController = new AbortController()
const pending = new Set<HTMLElement>()

async function initializeMedia(): Promise<void> {
	const { signal } = pageController
	await Promise.all(
		Array.from(document.querySelectorAll<HTMLElement>(VIDEO_ELEMENT_SELECTOR), async (element) => {
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
document.addEventListener('astro:before-swap', () => {
	pageController.abort()
	pageController = new AbortController()
	pending.clear()
})
