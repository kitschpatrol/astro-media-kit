// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { isHlsSource, setVideoSourceWhenReady } from '../src/components/internal/video-source'
import { createControlsActivity } from '../src/components/utils/controls-activity'
afterEach(() => {
	vi.useRealTimers()
	document.body.replaceChildren()
})

describe('video sources', () => {
	it('initializes new HLS players after navigation without reloading the current page twice', async () => {
		customElements.define(
			'hlsjs-video',
			class extends HTMLElement {
				get source(): { src: string } {
					return { src: this.getAttribute('src') ?? '' }
				}

				set source(value: { src: string }) {
					this.setAttribute('src', value.src)
				}
			},
		)
		document.body.innerHTML = '<hlsjs-video data-src="/first.m3u8"></hlsjs-video>'
		await import('../src/components/internal/videojs-media')
		const first = document.querySelector('hlsjs-video')!
		await vi.waitFor(() => expect(first.getAttribute('src')).toBe('/first.m3u8'))
		const assignment = vi.spyOn(first, 'setAttribute')
		document.dispatchEvent(new Event('astro:page-load'))
		await Promise.resolve()
		expect(assignment).not.toHaveBeenCalled()
		document.dispatchEvent(new Event('astro:before-swap'))
		document.body.innerHTML = '<hlsjs-video data-src="/second.m3u8"></hlsjs-video>'
		document.dispatchEvent(new Event('astro:page-load'))
		await vi.waitFor(() =>
			expect(document.querySelector('hlsjs-video')?.getAttribute('src')).toBe('/second.m3u8'),
		)
		document.dispatchEvent(new Event('astro:before-swap'))
		assignment.mockRestore()
	})

	it('recognizes local and signed HLS manifests independently of their host', () => {
		for (const src of [
			'/clip.m3u8',
			'./clip.M3U8',
			'https://cdn.example/clip.m3u8?token=abc#time',
		]) {
			expect(isHlsSource(src)).toBe(true)
		}

		expect(isHlsSource('https://cdn.example/clip.mp4?name=clip.m3u8')).toBe(false)
	})

	it('waits for player attachment before loading media, and can cancel that wait', () => {
		const player = document.createElement('video-player')
		const video = document.createElement('video')
		player.append(video)
		const listeners = new Set<() => void>()
		const store = {
			subscribe(listener: () => void) {
				listeners.add(listener)
				return () => listeners.delete(listener)
			},
			target: undefined as HTMLElement | undefined,
		}
		Object.defineProperty(player, 'store', { value: store })
		const cancel = setVideoSourceWhenReady(video, '/cancelled.mp4')
		cancel()
		expect(listeners.size).toBe(0)
		setVideoSourceWhenReady(video, '/clip.mp4')
		expect(video.hasAttribute('src')).toBe(false)
		store.target = video
		for (const listener of listeners) {
			listener()
		}

		expect(video.getAttribute('src')).toBe('/clip.mp4')
		expect(listeners.size).toBe(0)
	})
})

describe('lifted player controls', () => {
	it('keeps focused controls visible, resumes hiding after blur, and cancels on disposal', () => {
		vi.useFakeTimers()
		const root = document.createElement('div')
		const controls = document.createElement('div')
		const button = document.createElement('button')
		controls.append(button)
		root.append(controls)
		document.body.append(root)
		const activity = createControlsActivity(root)
		activity.setControls(controls)
		button.focus()
		vi.advanceTimersByTime(2500)
		expect(controls.dataset.userInactive).toBeUndefined()
		button.blur()
		vi.advanceTimersByTime(2500)
		expect(controls.dataset.userInactive).toBe('')
		activity.markActive()
		activity.destroy()
		vi.advanceTimersByTime(2500)
		expect(controls.dataset.userInactive).toBeUndefined()
	})

	it('keeps a slider drag visible until its pointer is released outside the player', () => {
		vi.useFakeTimers()
		const root = document.createElement('div')
		const controls = document.createElement('div')
		root.append(controls)
		document.body.append(root)
		const activity = createControlsActivity(root)
		activity.setControls(controls)
		controls.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))
		vi.advanceTimersByTime(2500)
		expect(controls.dataset.userInactive).toBeUndefined()
		document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }))
		vi.advanceTimersByTime(2500)
		expect(controls.dataset.userInactive).toBe('')
		activity.destroy()
	})
})
