/**
 * Audio across a gallery: while the viewer shows one item, media playing in the
 * others fades to silence, and comes back as the carousel reaches it, to the
 * level it had when the gallery was first opened, or to one set since in the
 * viewer. Everything returns to that level when the viewer closes. Media that
 * isn't playing is left alone.
 */

/** A native media element, or a Video.js media element, which mirrors its API. */
type MediaLike = EventTarget & { paused: boolean; volume: number }

type Tracked = {
	/** Releases the listener that follows levels set by hand. */
	controller: AbortController
	frame: number | undefined
	/** The volume to come back to. */
	level: number
}

/** How long a fade takes, in ms. */
const fadeDuration = 250

const tracked = new Map<MediaLike, Tracked>()

/** The media in the item on show, whose sound the viewer leaves alone. */
let heard = new Set<MediaLike>()

/**
 * Remember the level of every media element in `roots`, unless it is already
 * being tracked from a session that is still fading out, then let the one in
 * `active` play on while the others fade away.
 */
export function beginVolumes(roots: Element[], active: Element | undefined) {
	for (const root of roots) {
		for (const media of mediaIn(root)) {
			if (!tracked.has(media)) {
				tracked.set(media, track(media))
			}
		}
	}

	if (active !== undefined) {
		focusVolumes(active)
	}
}

/**
 * Bring the media in `active` back to its level, and fade everything else that
 * is playing away.
 */
export function focusVolumes(active: Element) {
	heard = new Set(mediaIn(active))
	for (const [media, entry] of tracked) {
		if (heard.has(media)) {
			fade(media, entry, entry.level)
		} else if (!media.paused) {
			fade(media, entry, 0)
		}
	}
}

/** Bring every tracked media element back to its level, and forget it. */
export function endVolumes() {
	heard = new Set()
	for (const [media, entry] of tracked) {
		fade(media, entry, entry.level, () => {
			entry.controller.abort()
			tracked.delete(media)
		})
	}
}

/**
 * Start tracking `media` at its current level. A level the user sets while it
 * is the one heard, between fades, is the one to come back to from then on.
 */
function track(media: MediaLike): Tracked {
	const controller = new AbortController()
	const entry: Tracked = { controller, frame: undefined, level: media.volume }
	media.addEventListener(
		'volumechange',
		() => {
			if (entry.frame === undefined && heard.has(media)) {
				entry.level = media.volume
			}
		},
		{ signal: controller.signal },
	)
	return entry
}

/**
 * The media inside `root`: native elements, and the kit's media elements, which
 * wrap a native element or an embedded player behind the same API.
 */
function mediaIn(root: Element): MediaLike[] {
	const found = new Set<MediaLike>()
	for (const element of root.querySelectorAll('audio, video, .amk-media')) {
		if (isMediaLike(element)) {
			found.add(element)
		}
	}

	return [...found]
}

function isMediaLike(element: Element): element is Element & MediaLike {
	return (
		element instanceof HTMLMediaElement ||
		(typeof (element as Partial<MediaLike>).volume === 'number' &&
			typeof (element as Partial<MediaLike>).paused === 'boolean')
	)
}

/** Fade `media` to `target` from wherever it is, replacing any fade under way. */
function fade(media: MediaLike, entry: Tracked, target: number, onDone?: () => void) {
	if (entry.frame !== undefined) {
		cancelAnimationFrame(entry.frame)
		entry.frame = undefined
	}

	const from = media.volume
	if (Math.abs(from - target) < 0.001) {
		media.volume = target
		onDone?.()
		return
	}

	let start: number | undefined
	const step = (time: number) => {
		start ??= time
		const progress = Math.min(1, (time - start) / fadeDuration)
		media.volume = from + (target - from) * progress
		if (progress < 1) {
			entry.frame = requestAnimationFrame(step)
		} else {
			entry.frame = undefined
			onDone?.()
		}
	}

	entry.frame = requestAnimationFrame(step)
}
