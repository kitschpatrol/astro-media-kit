import { rendered } from './dom'
import { fittedWidth } from './prepare'
import { warmImage } from './warm-image'

/** How long a lift waits for a link's media before showing it regardless. */
const showTimeout = 1500

/**
 * Wait for a link's media to have something to show, within a limit: an image
 * decoded, or a player's poster loaded. Nothing to wait for otherwise.
 */
export async function readyToShow(subject: Element): Promise<void> {
	const shown = rendered(subject)
	const loading = shown instanceof HTMLImageElement ? shown.decode() : posterOf(subject)?.decode()
	if (loading === undefined) {
		return
	}

	await Promise.race([
		settled(loading),
		new Promise((resolve) => {
			setTimeout(resolve, showTimeout)
		}),
	])
}

/**
 * Start loading what a link's media shows first, ahead of a lift: the fitted
 * candidate of an image, or a player's poster.
 */
export function warmLink(subject: Element) {
	if (rendered(subject) instanceof HTMLImageElement) {
		warmImage(subject, fittedWidth(subject))
	} else {
		posterOf(subject)
	}
}

/** An image loading the poster of the player in `subject`, if it has one. */
function posterOf(subject: Element): HTMLImageElement | undefined {
	const poster = subject.querySelector('video-player')?.getAttribute('poster') ?? ''
	if (poster === '') {
		return undefined
	}

	const image = new Image()
	image.src = poster
	return image
}

/**
 * A decode once it is over, failed or not: a failed image shows as it is, and a
 * replaced candidate shows as it comes.
 */
async function settled(loading: Promise<void>): Promise<void> {
	try {
		await loading
	} catch {
		// Nothing to wait for any more
	}
}
