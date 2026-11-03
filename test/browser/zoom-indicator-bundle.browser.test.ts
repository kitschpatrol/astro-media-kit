import { expect, it } from 'vitest'
import { waitForFrame } from './frame'

it('loads image indicators without Video.js and restores their defaults after client navigation', async () => {
	const frame = document.createElement('iframe')
	frame.src = '/zoom-indicator/index.html'
	frame.style.cssText = 'width: 1000px; height: 700px; border: 0'
	document.body.append(frame)
	try {
		await waitForFrame(frame, 'zoom-indicator')
		const root = frame.contentDocument!
		await expect
			.poll(() => root.querySelector(':scope #builtin [data-custom-icon="global-indicator"]'))
			.not.toBeNull()
		const registry = (frame.contentWindow as Window & { customElements: CustomElementRegistry })
			.customElements
		expect(registry.get('media-icon')).toBeUndefined()
		expect(registry.get('video-player')).toBeUndefined()
		expect(registry.get('audio-player')).toBeUndefined()
		root.querySelector<HTMLElement>('#navigate-default')!.click()
		await expect.poll(() => root.title, { timeout: 5000 }).toBe('Default indicators')
		expect(frame.contentDocument).toBe(root)
		await expect.poll(() => root.querySelector(':scope .amk-zoom-indicator svg')).not.toBeNull()
		expect(root.querySelector('[data-custom-icon]')).toBeNull()
	} finally {
		frame.remove()
	}
})
