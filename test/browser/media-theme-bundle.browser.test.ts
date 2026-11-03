import { expect, it } from 'vitest'
import { waitForFrame } from './frame'

it.each(['media-audio-first', 'media-video-first'])(
	'connects both player contexts when %s initializes shared controls',
	async (route) => {
		const frame = document.createElement('iframe')
		frame.src = `/${route}/index.html`
		frame.style.cssText = 'width: 1000px; height: 700px; border: 0'
		document.body.append(frame)
		try {
			await waitForFrame(frame, route)
			await expect
				.poll(
					() =>
						frame.contentDocument
							?.querySelector('video-player media-play-button')
							?.getAttribute('aria-label'),
					{ timeout: 5000 },
				)
				.toBe('Play')
			const root: Document = frame.contentDocument!
			expect(root.documentElement.dataset.firstHasSeek).toBe(String(route === 'media-audio-first'))
			expect(root.documentElement.dataset.firstHasFullscreen).toBe(
				String(route === 'media-video-first'),
			)
			for (const kind of ['audio-player', 'video-player']) {
				const player = root.querySelector<HTMLElement>(kind)!
				await expect
					.poll(() => player.querySelector(':scope media-play-button')?.getAttribute('aria-label'))
					.toBe('Play')
				const mute = player.querySelector<HTMLElement>(':scope media-mute-button')!
				await expect.poll(() => mute.getAttribute('aria-label')).toBe('Unmute')
				mute.click()
				await expect.poll(() => mute.getAttribute('aria-label')).toBe('Mute')
			}

			const video = root.querySelector<HTMLVideoElement>(':scope video')!
			video.muted = true
			root.querySelector<HTMLElement>(':scope video-player media-play-button')!.click()
			await expect.poll(() => video.paused, { timeout: 5000 }).toBe(false)
		} finally {
			frame.remove()
		}
	},
)

it('initializes both player themes and refreshes the cached viewer across Astro navigation', async () => {
	const frame = document.createElement('iframe')
	frame.src = '/media-theme/index.html'
	frame.style.cssText = 'width: 1000px; height: 700px; border: 0'
	document.body.append(frame)
	try {
		await waitForFrame(frame, 'media-theme')
		await expect
			.poll(() =>
				frame.contentDocument
					?.querySelector<HTMLElement>('audio-player media-play-button')
					?.getAttribute('aria-label'),
			)
			.toBe('Play')
		const root: Document = frame.contentDocument!
		await expect
			.poll(
				() =>
					getComputedStyle(root.querySelector<HTMLElement>(':scope audio-player media-container')!)
						.visibility,
			)
			.toBe('visible')
		for (const kind of ['audio-player', 'video-player']) {
			await expect
				.poll(
					() =>
						root.querySelector<SVGElement>(`:scope ${kind} media-icon[name="play"] svg`)?.dataset
							.customIcon,
				)
				.toBe('play')
		}

		root.querySelector<HTMLElement>(':scope .amk-zoom')!.click()
		await expect
			.poll(
				() => root.querySelector<SVGElement>(':scope .amk-lightbox-close svg')?.dataset.customIcon,
			)
			.toBe('close')
		root.querySelector<HTMLElement>(':scope .amk-lightbox-close')!.click()
		await expect
			.poll(() => root.querySelector<HTMLDialogElement>(':scope .amk-lightbox')?.open)
			.toBe(false)
		root.querySelector<HTMLElement>(':scope #navigate-themed')!.click()
		await expect.poll(() => root.title, { timeout: 5000 }).toBe('Another media theme')
		expect(frame.contentDocument).toBe(root)
		await expect
			.poll(
				() =>
					getComputedStyle(root.querySelector<HTMLElement>(':scope audio-player media-container')!)
						.visibility,
			)
			.toBe('visible')
		await expect
			.poll(
				() =>
					root.querySelector<SVGElement>(':scope audio-player media-icon[name="play"] svg')?.dataset
						.customIcon,
			)
			.toBe('new-play')
		root.querySelector<HTMLElement>(':scope .amk-zoom')!.click()
		await expect
			.poll(
				() => root.querySelector<SVGElement>(':scope .amk-lightbox-close svg')?.dataset.customIcon,
			)
			.toBe('new-close')
		root.querySelector<HTMLElement>(':scope .amk-lightbox-close')!.click()
		await expect
			.poll(() => root.querySelector<HTMLDialogElement>(':scope .amk-lightbox')?.open)
			.toBe(false)
		root.querySelector<HTMLElement>(':scope #navigate-default')!.click()
		await expect.poll(() => root.title, { timeout: 5000 }).toBe('Zoom integration')
		expect(frame.contentDocument).toBe(root)
		await expect
			.poll(
				() =>
					getComputedStyle(root.querySelector<HTMLElement>(':scope audio-player media-container')!)
						.visibility,
			)
			.toBe('visible')
		await expect
			.poll(() => root.querySelector<SVGElement>(':scope audio-player media-icon[name="play"] svg'))
			.not.toBeNull()
		expect(root.querySelector<SVGElement>(':scope audio-player svg[data-custom-icon]')).toBeNull()
		expect(root.querySelector<SVGElement>(':scope video-player svg[data-custom-icon]')).toBeNull()
		root.querySelector<HTMLElement>(':scope .amk-zoom')!.click()
		await expect
			.poll(() => root.querySelector<HTMLDialogElement>(':scope .amk-lightbox')?.open)
			.toBe(true)
		expect(root.querySelector<SVGElement>(':scope .amk-lightbox svg[data-custom-icon]')).toBeNull()
	} finally {
		frame.remove()
	}
})

it('supports image-only icon themes without loading Video.js', async () => {
	const frame = document.createElement('iframe')
	frame.src = '/media-theme-image/index.html'
	frame.style.cssText = 'width: 1000px; height: 700px; border: 0'
	document.body.append(frame)
	try {
		await waitForFrame(frame, 'media-theme-image')
		await expect.poll(() => frame.contentDocument?.readyState).toBe('complete')
		await expect
			.poll(() => frame.contentDocument?.querySelector<HTMLElement>('.amk-zoom'))
			.not.toBeNull()
		const root: Document = frame.contentDocument!
		await expect.poll(() => root.readyState).toBe('complete')
		await expect
			.poll(
				() => root.querySelector<SVGElement>(':scope .amk-carousel-next svg')?.dataset.customIcon,
			)
			.toBe('carousel-next')
		root.querySelector<HTMLElement>(':scope .amk-zoom')!.click()
		await expect
			.poll(
				() => root.querySelector<SVGElement>(':scope .amk-lightbox-close svg')?.dataset.customIcon,
			)
			.toBe('image-only')
		const registry = (frame.contentWindow as Window & { customElements: CustomElementRegistry })
			.customElements
		expect(registry.get('media-icon')).toBeUndefined()
		expect(registry.get('video-player')).toBeUndefined()
		expect(registry.get('audio-player')).toBeUndefined()
	} finally {
		frame.remove()
	}
})
