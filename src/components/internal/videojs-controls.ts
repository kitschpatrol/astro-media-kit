/**
 * Keeps a player's control bar from hiding while the pointer is over it, as a
 * bar is expected to: Video.js hides the controls after a moment without
 * pointer movement, and closes any popup open in them, such as the volume
 * popover, with them. The lock on the controls that Video.js's menus hold while
 * open is held here while the pointer is over the bar or a popup of its own, by
 * a pair of document listeners that cover every player on the page, whenever it
 * arrived.
 */

type Player = Element & { store?: { state?: { requestControlsLock?: () => () => void } } }

/** The release of the lock each hovered bar holds. */
const releases = new WeakMap<Element, () => void>()

function barOf(target: EventTarget | undefined): Element | undefined {
	return target instanceof Element ? (target.closest('.amk-bar') ?? undefined) : undefined
}

function handlePointer(event: PointerEvent) {
	const isEntering = event.type === 'pointerover'
	const target = event.target ?? undefined
	const related = event.relatedTarget ?? undefined
	const entering = barOf(isEntering ? target : related)
	const leaving = barOf(isEntering ? related : target)
	if (leaving === entering) {
		return
	}

	if (leaving !== undefined) {
		releases.get(leaving)?.()
		releases.delete(leaving)
	}

	if (entering === undefined || releases.has(entering)) {
		return
	}

	const release = entering.closest<Player>('video-player')?.store?.state?.requestControlsLock?.()
	if (release !== undefined) {
		releases.set(entering, release)
	}
}

document.addEventListener('pointerover', handlePointer)
document.addEventListener('pointerout', handlePointer)
