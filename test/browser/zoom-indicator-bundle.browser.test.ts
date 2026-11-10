import { expect, it } from 'vitest'
import { waitForFrame } from './frame'

it('draws image indicators without loading Video.js, and keeps them across client navigation', async () => {
	const frame = document.createElement('iframe')
	frame.src = '/zoom-indicator/index.html'
	frame.style.cssText = 'width: 1000px; height: 700px; border: 0'
	document.body.append(frame)
	try {
		await waitForFrame(frame, 'zoom-indicator')
		const root = frame.contentDocument!
		expect(root.querySelector(':scope #builtin .amk-zoom-indicator svg')).not.toBeNull()
		expect(root.querySelector(':scope #custom [data-custom-icon="local-indicator"]')).not.toBeNull()
		const registry = (frame.contentWindow as Window & { customElements: CustomElementRegistry })
			.customElements
		expect(registry.get('video-player')).toBeUndefined()
		expect(registry.get('audio-player')).toBeUndefined()
		root.querySelector<HTMLElement>('#navigate-default')!.click()
		await expect.poll(() => root.title, { timeout: 5000 }).toBe('Default indicators')
		expect(frame.contentDocument).toBe(root)
		expect(root.querySelector(':scope .amk-zoom-indicator svg')).not.toBeNull()
	} finally {
		frame.remove()
	}
})
