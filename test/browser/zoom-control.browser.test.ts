import { afterEach, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	boxes,
	cleanUp,
	currentStage,
	fadeOf,
	frames,
	mount,
	query,
	setUpLightbox,
	transitionsDone,
	viewer,
	zoomable,
} from './helpers'
import { lift, pinch } from './touch'

setUpLightbox()
afterEach(async () => {
	await commands.emulateReducedMotion(false)
	await cleanUp()
})

async function open() {
	await openLightbox(boxes(mount(zoomable('fit')))[0]!)
	await pinch(2)
	lift()
	await transitionsDone()
	return query(viewer(), '.amk-lightbox-zoom', HTMLButtonElement)
}

it('fades the reset icon before hiding it, moving focus and disabling input immediately', async () => {
	const button = await open()
	button.focus()
	await pinch(0.4)
	lift()
	// The image springs back to fit first
	await expect.poll(() => fadeOf(button)).toBeDefined()
	const fade = fadeOf(button)
	fade!.pause()
	fade!.currentTime = 40
	expect(button.hidden).toBe(false)
	expect(button.inert).toBe(true)
	expect(button.ariaPressed).toBe('true')
	expect(document.activeElement).toBe(currentStage())
	expect(Number(getComputedStyle(button).opacity)).toBeGreaterThan(0)
	expect(Number(getComputedStyle(button).opacity)).toBeLessThan(1)
	fade!.finish()
	await expect.poll(() => button.hidden).toBe(true)
})

it('reverses a pending fade when another pinch needs the reset control', async () => {
	const button = await open()
	await pinch(0.4)
	lift()
	await expect.poll(() => fadeOf(button)).toBeDefined()
	const fades = button.getAnimations()
	for (const fade of fades) {
		fade.pause()
		fade.currentTime = 40
	}

	await pinch(2)
	lift()
	await transitionsDone()
	await frames()
	expect(button.hidden).toBe(false)
	expect(button.inert).toBe(false)
	expect(button.ariaPressed).toBe('true')
	expect(getComputedStyle(button).opacity).toBe('1')
})

it('hides the reset control without a fade when reduced motion is requested', async () => {
	const button = await open()
	await commands.emulateReducedMotion(true)
	await pinch(0.4)
	lift()
	await expect.poll(() => button.hidden).toBe(true)
	expect(button.getAnimations()).toHaveLength(0)
})
