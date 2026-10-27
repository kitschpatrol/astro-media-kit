/**
 * Keeps a player's control bar from hiding while the pointer is over it, as a
 * bar is expected to: Video.js hides the controls after a moment without
 * pointer movement, and closes any popup open in them, such as the volume
 * popover, with them. The lock on the controls that Video.js's menus hold while
 * open is held here while the pointer is over the bar or a popup of its own, by
 * document listeners that cover every player on the page, whenever it arrived.
 * Playback events also drive the paused visibility rule, and an earlier idle
 * timer uses Video.js's public action so its interaction locks still apply.
 */

type Player = HTMLElement & {
	store?: {
		state?: {
			requestControlsLock?: () => () => void
			toggleControls?: (visible: boolean) => boolean
		}
	}
}

const idleTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>()

/** Shorten Video.js's fixed two-second idle delay through its public action. */
function scheduleIdle(event: Event) {
	const player =
		event.target instanceof Element ? event.target.closest<Player>('.amk-player') : undefined
	if (!player) {
		return
	}

	clearTimeout(idleTimers.get(player))
	if (!Object.hasOwn(player.dataset, 'playing')) {
		return
	}

	idleTimers.set(
		player,
		setTimeout(() => {
			idleTimers.delete(player)
			const controls = player.querySelector<HTMLElement>('.amk-controls')
			if (
				controls &&
				player.isConnected &&
				Object.hasOwn(player.dataset, 'playing') &&
				!controls.hasAttribute('popover') &&
				!controls.matches(':has(:focus-visible)')
			) {
				player.store?.state?.toggleControls?.(false)
			}
		}, 1500),
	)
}

function reflectPlayback(event: Event) {
	if (!(event.target instanceof Element) || !event.target.matches('.amk-media')) {
		return
	}

	const player = event.target.closest('.amk-player')
	player?.toggleAttribute('data-playing', event.type === 'play')
	const controls = player?.querySelector<HTMLElement>('.amk-controls')
	if (controls && event.type !== 'play') {
		delete controls.dataset.userInactive
	}

	scheduleIdle(event)
}

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

for (const type of [
	'pointermove',
	'pointerup',
	'pointercancel',
	'keydown',
	'keyup',
	'focusin',
	'focusout',
]) {
	document.addEventListener(type, scheduleIdle)
}

for (const type of ['play', 'pause', 'ended']) {
	document.addEventListener(type, reflectPlayback, { capture: true })
}
