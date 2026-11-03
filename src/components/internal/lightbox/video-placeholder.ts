import { previewContext } from './canvas-context'

/** The on-page box of an image or video, and the way its source fits that box. */
export type PreviewFrame = { height: number; objectFit: string; width: number }

/**
 * Match the displayed resolution of a source with these intrinsic dimensions,
 * including display density and cropping.
 */
export function previewSize(source: { width: number; height: number }, frame: PreviewFrame) {
	let { width, height } = frame
	let density = devicePixelRatio
	if (frame.objectFit !== 'fill') {
		const contain = Math.min(width / source.width, height / source.height)
		const scale =
			frame.objectFit === 'cover'
				? Math.max(width / source.width, height / source.height)
				: frame.objectFit === 'none'
					? 1
					: frame.objectFit === 'scale-down'
						? Math.min(1, contain)
						: contain
		width = source.width * scale
		height = source.height * scale
		if (frame.objectFit === 'none' || frame.objectFit === 'scale-down') {
			// These fits use the bitmap's intrinsic dimensions as CSS dimensions.
			// Exceeding the source size would enlarge the preview's visible content.
			density = Math.max(1, Math.min(density, 1 / scale))
		}
	}

	return {
		width: Math.max(1, Math.ceil(width * density)),
		height: Math.max(1, Math.ceil(height * density)),
	}
}

/** Mirror decoded frames at the thumbnail's pixel density until released. */
export function mirrorVideo(
	video: HTMLVideoElement,
	canvas: HTMLCanvasElement,
	target: PreviewFrame,
) {
	const context = previewContext(canvas)
	if (context === undefined) {
		return () => {
			// No rendering resources were allocated.
		}
	}

	const controller = new AbortController()
	let frame: number | undefined
	let isIntersecting = false
	const cancel = () => {
		if (frame === undefined) {
			return
		}

		video.cancelVideoFrameCallback(frame)
		frame = undefined
	}

	const draw = () => {
		if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
			return
		}

		const { width, height } = previewSize(
			{ width: video.videoWidth, height: video.videoHeight },
			target,
		)
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width
			canvas.height = height
		}

		try {
			context.drawImage(video, 0, 0, width, height)
		} catch {
			// A frame can become unavailable during a source change.
		}
	}

	const schedule = () => {
		if (frame === undefined && !video.paused && !video.ended) {
			frame = video.requestVideoFrameCallback(() => {
				frame = undefined
				update()
			})
		}
	}

	const update = () => {
		if (!isIntersecting || document.hidden || !canvas.isConnected || controller.signal.aborted) {
			cancel()
			return
		}

		draw()
		if (video.paused || video.ended) {
			cancel()
		} else {
			schedule()
		}
	}

	const observer = new IntersectionObserver(([entry]) => {
		isIntersecting = entry?.isIntersecting === true
		update()
	})
	// A single initial frame also covers the time before visibility is observed.
	canvas.width = 1
	canvas.height = 1
	draw()
	observer.observe(canvas)
	document.addEventListener('visibilitychange', update, { signal: controller.signal })
	window.addEventListener('resize', update, { signal: controller.signal })
	for (const type of ['loadeddata', 'play', 'pause', 'seeked', 'ended', 'resize']) {
		video.addEventListener(type, update, { signal: controller.signal })
	}

	return () => {
		controller.abort()
		observer.disconnect()
		cancel()
	}
}
