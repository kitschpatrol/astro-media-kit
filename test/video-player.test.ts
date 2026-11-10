// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createControlsActivity } from '../src/components/internal/lightbox/player-controls'
import { isHlsSource, setMediaSourceWhenReady } from '../src/components/internal/video-source'
afterEach(() => {
	vi.useRealTimers()
	document.body.replaceChildren()
})

describe('media sources', () => {
	it('initializes HLS and audio after navigation without reloading the current page twice', async () => {
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
		document.body.innerHTML =
			'<div class="amk"><hlsjs-video data-src="/first.m3u8"></hlsjs-video><audio data-src="/first.wav"></audio></div>'
		await import('../src/components/internal/videojs-media')
		const first = document.querySelector('hlsjs-video')!
		await vi.waitFor(() => expect(first.getAttribute('src')).toBe('/first.m3u8'))
		const audio = document.querySelector('audio')!
		expect(audio.getAttribute('src')).toBe('/first.wav')
		const assignment = vi.spyOn(first, 'setAttribute')
		const audioAssignment = vi.spyOn(audio, 'setAttribute')
		document.dispatchEvent(new Event('astro:page-load'))
		await Promise.resolve()
		expect(assignment).not.toHaveBeenCalled()
		expect(audioAssignment).not.toHaveBeenCalled()
		document.dispatchEvent(new Event('astro:before-swap'))
		document.body.innerHTML =
			'<div class="amk"><hlsjs-video data-src="/second.m3u8"></hlsjs-video><audio data-src="/second.wav"></audio></div>'
		document.dispatchEvent(new Event('astro:page-load'))
		await vi.waitFor(() =>
			expect(document.querySelector('hlsjs-video')?.getAttribute('src')).toBe('/second.m3u8'),
		)
		expect(document.querySelector('audio')?.getAttribute('src')).toBe('/second.wav')
		document.dispatchEvent(new Event('astro:before-swap'))
		assignment.mockRestore()
		audioAssignment.mockRestore()
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

	it.each(['audio', 'video'])(
		'waits for %s attachment before loading, and can cancel that wait',
		(kind) => {
			const player = document.createElement(`${kind}-player`)
			const media = document.createElement(kind)
			player.append(media)
			const listeners = new Set<() => void>()
			const store = {
				subscribe(listener: () => void) {
					listeners.add(listener)
					return () => listeners.delete(listener)
				},
				target: undefined as HTMLElement | undefined,
			}
			Object.defineProperty(player, 'store', { value: store })
			const cancel = setMediaSourceWhenReady(media, '/cancelled.mp4')
			cancel()
			expect(listeners.size).toBe(0)
			setMediaSourceWhenReady(media, '/clip.mp4')
			expect(media.hasAttribute('src')).toBe(false)
			store.target = media
			for (const listener of listeners) {
				listener()
			}

			expect(media.getAttribute('src')).toBe('/clip.mp4')
			expect(listeners.size).toBe(0)
		},
	)
})

describe('lifted player controls', () => {
	it.each(['play', 'pause', 'ended'])('ignores %s events from inactive gallery players', (type) => {
		vi.useFakeTimers()
		const root = document.createElement('div')
		root.innerHTML =
			'<video-player data-playing><video></video><div class="controls"></div></video-player><video-player><video></video></video-player>'
		document.body.append(root)
		const controls = root.querySelector<HTMLElement>('.controls')!
		const [active, inactive] = root.querySelectorAll('video')
		const activity = createControlsActivity(root)
		activity.setControls(controls)
		vi.advanceTimersByTime(1500)
		expect(controls.dataset.userInactive).toBe('')
		inactive!.dispatchEvent(new Event(type))
		expect(controls.dataset.userInactive).toBe('')
		active!.dispatchEvent(new Event(type))
		expect(controls.dataset.userInactive).toBeUndefined()
		activity.destroy()
	})

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
