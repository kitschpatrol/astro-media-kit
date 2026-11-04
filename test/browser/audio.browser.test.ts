import { expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { waitForFrame } from './frame'

it('reports an audio startup failure even when the player scripts arrive late', async () => {
	const response = await fetch('/audio-startup/index.html')
	const page = new DOMParser().parseFromString(await response.text(), 'text/html')
	const scripts = [...page.querySelectorAll('script')]
	for (const script of scripts) {
		script.remove()
	}

	const frame = document.createElement('iframe')
	frame.srcdoc = page.documentElement.outerHTML
	document.body.append(frame)
	try {
		await expect.poll(() => Boolean(frame.contentDocument?.querySelector('audio'))).toBe(true)
		const root = frame.contentDocument!
		const audio = root.querySelector('audio')!
		// Let an eagerly assigned source finish failing before any player script
		// can observe it, as happens when a media request outruns JavaScript.
		await expect.poll(() => audio.hasAttribute('src') && audio.error === null).toBe(false)

		for (const script of scripts) {
			const executable = root.createElement('script')
			for (const { name, value } of script.attributes) {
				executable.setAttribute(name, value)
			}

			executable.textContent = script.textContent
			root.body.append(executable)
		}

		await expect.poll(() => audio.error?.code).toBe(4)
		await expect
			.poll(() => root.querySelector('media-error-dialog')?.hasAttribute('data-open'))
			.toBe(true)
		expect(root.querySelector('media-dialog-description')?.textContent).not.toBe('')
		root.querySelector<HTMLElement>('media-dialog-close')!.click()
		await expect
			.poll(() => root.querySelector('media-error-dialog')?.hasAttribute('data-open'))
			.toBe(false)
	} finally {
		frame.remove()
	}
})

it('plays only the native audio fallback when JavaScript is disabled', async () => {
	const frame = document.createElement('iframe')
	frame.sandbox.add('allow-same-origin')
	frame.src = '/audio-startup/index.html'
	const playButton = document.createElement('button')
	playButton.textContent = 'Play native audio'
	document.body.append(frame, playButton)
	try {
		await waitForFrame(frame, 'audio-startup')
		const root = frame.contentDocument!
		const original = root.querySelector<HTMLAudioElement>(':scope #playable audio-player audio')!
		const fallback = root.querySelector<HTMLAudioElement>(':scope #playable noscript audio')!
		expect(fallback.controls).toBe(true)
		// Give the same-origin child a trusted gesture, independent of autoplay
		// permission or any interactions in earlier tests.
		const playback = new Promise<void>((resolve, reject) => {
			playButton.addEventListener(
				'click',
				() => {
					void fallback.play().then(resolve).catch(reject)
				},
				{ once: true },
			)
		})
		await Promise.all([playback, userEvent.click(playButton)])
		await expect.poll(() => fallback.currentTime).toBeGreaterThan(0)
		expect(original.currentSrc).toBe('')
		expect(original.paused).toBe(true)
	} finally {
		frame.remove()
		playButton.remove()
	}
})
