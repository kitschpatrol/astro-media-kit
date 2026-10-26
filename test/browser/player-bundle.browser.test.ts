import { expect, it } from 'vitest'

// Load the built scripts in a separate document. Mounting server HTML into
// the test document cannot catch registration order in Astro's shared chunks.
it.each(['zoom', 'zoom-hls'])(
	'connects the bundled %s controls before and after repeated lifts',
	async (route) => {
		const frame = document.createElement('iframe')
		frame.src = `/${route}/index.html`
		frame.style.cssText = 'width: 1000px; height: 700px; border: 0'
		document.body.append(frame)
		try {
			await expect
				.poll(() =>
					frame.contentDocument?.querySelector('amk-mute-button')?.getAttribute('aria-label'),
				)
				.toBe('Unmute')
			const root = frame.contentDocument!
			const player = root.querySelector('video-player')!
			const media = player.querySelector<HTMLVideoElement>('video, hlsjs-video')!
			const mute = player.querySelector<HTMLElement>('amk-mute-button')!
			const zoom = player.querySelector<HTMLElement>('[data-zoom-open]')!
			await expect.poll(() => media.readyState, { timeout: 10_000 }).toBeGreaterThan(0)
			await expect
				.poll(() => player.querySelector('media-controls-content')?.hasAttribute('data-visible'))
				.toBe(true)
			await expect
				.poll(() => player.querySelector('media-play-button')?.getAttribute('aria-label'))
				.toBe('Play')

			for (const _ of [0, 1]) {
				zoom.click()
				await expect
					.poll(() => root.querySelector<HTMLElement>('.amk-lightbox')?.dataset.state)
					.toBe('open')
				mute.focus()
				const popover = player.querySelector('media-volume-popover')!
				await expect.poll(() => popover.matches(':popover-open')).toBe(true)
				for (const muted of [false, true]) {
					mute.click()
					await expect.poll(() => media.muted).toBe(muted)
					expect(popover.matches(':popover-open')).toBe(true)
				}

				media.volume = 0.4
				await expect
					.poll(
						() => player.querySelector(':scope media-volume-slider [role="slider"]')?.ariaValueNow,
					)
					.toBe('40')
				zoom.click()
				await expect
					.poll(() => root.querySelector<HTMLDialogElement>('.amk-lightbox')?.open)
					.toBe(false)
				await expect.poll(() => mute.getAttribute('aria-label')).toBe('Unmute')
				// The gallery restores its original level over a 250 ms fade.
				await expect.poll(() => media.volume).toBe(1)
			}
		} finally {
			frame.remove()
		}
	},
)
