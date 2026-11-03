import { expect } from 'vitest'

/**
 * Wait for the requested production page and its deferred module scripts to
 * finish loading before interacting with its controls.
 */
export async function waitForFrame(frame: HTMLIFrameElement, route: string): Promise<void> {
	await expect
		.poll(
			() => {
				const root = frame.contentDocument
				return root?.location.pathname === `/${route}/index.html` && root.readyState === 'complete'
			},
			{ timeout: 10_000 },
		)
		.toBe(true)
}
