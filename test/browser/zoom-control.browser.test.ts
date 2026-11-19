import { afterEach, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import {
	cleanUp,
	currentStage,
	fadeOf,
	frames,
	isHidden,
	openZoomable,
	query,
	setUpLightbox,
	transitionsDone,
	viewer,
} from './helpers'
import { lift, pinch } from './touch'

setUpLightbox()
afterEach(async () => {
	await commands.emulateReducedMotion(false)
	await cleanUp()
})

async function open() {
	await openZoomable()
	await pinch(2)
	lift()
	await transitionsDone()
	return query(viewer(), '.amk-lightbox-zoom', HTMLButtonElement)
}

/** Hold the fade halfway through as soon as the reset control becomes inert. */
async function pinchToFit(button: HTMLButtonElement) {
	const observer = new MutationObserver(() => {
		if (!button.inert) {
			return
		}

		for (const transition of button.getAnimations()) {
			transition.pause()
			transition.currentTime = 40
		}

		observer.disconnect()
	})
	observer.observe(button, { attributeFilter: ['inert'], attributes: true })
	try {
		await pinch(0.4)
		lift()
		await expect.poll(() => fadeOf(button)?.playState).toBe('paused')
	} finally {
		observer.disconnect()
	}
}

it('fades the reset icon before hiding it, moving focus and disabling input immediately', async () => {
	const button = await open()
	button.focus()
	await pinchToFit(button)
	expect(isHidden(button)).toBe(false)
	expect(button.inert).toBe(true)
	expect(button.ariaPressed).toBe('true')
	expect(document.activeElement).toBe(currentStage())
	expect(Number(getComputedStyle(button).opacity)).toBeGreaterThan(0)
	expect(Number(getComputedStyle(button).opacity)).toBeLessThan(1)
	for (const transition of button.getAnimations()) {
		transition.finish()
	}

	await expect.poll(() => isHidden(button)).toBe(true)
})

it('reverses a pending fade when another pinch needs the reset control', async () => {
	const button = await open()
	await pinchToFit(button)

	await pinch(2)
	lift()
	await transitionsDone()
	await frames()
	expect(isHidden(button)).toBe(false)
	expect(button.inert).toBe(false)
	expect(button.ariaPressed).toBe('true')
	expect(getComputedStyle(button).opacity).toBe('1')
})

it('hides the reset control without a fade when reduced motion is requested', async () => {
	const button = await open()
	await commands.emulateReducedMotion(true)
	await pinch(0.4)
	lift()
	await expect.poll(() => isHidden(button)).toBe(true)
	expect(button.getAnimations()).toHaveLength(0)
})
