import { afterEach, expect, it } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { closeLightbox, openLightbox } from '../../src/components/internal/lightbox/lightbox'
import '../../src/components/internal/videojs-ui'
import '../../src/components/internal/videojs-media'
import '../../src/components/internal/amk-video.css'
import {
	boxes,
	cleanUp,
	currentLayer,
	currentStage,
	frames,
	liftDone,
	middleOf,
	mount,
	mountPage,
	playerItem,
	query,
	setUpLightbox,
	viewer,
	waitForMedia,
} from './helpers'
import { lift, pinch, pointer } from './touch'

setUpLightbox()
afterEach(async () => {
	await commands.touchContacts([])
	await cleanUp()
})

async function open(level = 'fit') {
	const fixture = await mountPage('/zoom/')
	document.dispatchEvent(new Event('astro:page-load'))
	const section = query(fixture, '#video')
	const item = boxes(section)[0]!
	item.dataset.level = level
	const player = query(item, 'video-player')
	const video = query(player, 'video', HTMLVideoElement)
	await customElements.whenDefined('video-player')
	await waitForMedia(video)
	await openLightbox(item)
	await liftDone()
	return { item, player, video }
}

it.each(['fit', 'fill', 'native'])(
	'pinches and pans a playing %s video while keeping its controls in place',
	async (level) => {
		const { item, player, video } = await open(level)
		const fitted = currentLayer().getBoundingClientRect()
		const controls = query(player, '.amk-controls')
		const bar = controls.getBoundingClientRect()
		await video.play()
		const { x, y } = await pinch(2)
		pointer('pointermove', 1, x - 100 + 70, y + 40)
		pointer('pointermove', 2, x + 100 + 70, y + 40)
		await frames()
		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(fitted.width * 2, 0)
		expect(video.paused).toBe(false)
		expect(controls.getBoundingClientRect().toJSON()).toEqual(bar.toJSON())
		lift()
		await userEvent.click(query(player, 'media-play-button'))
		await expect.poll(() => video.paused).toBe(true)
		expect(viewer().open).toBe(true)
		query(viewer(), '.amk-lightbox-zoom').click()
		await liftDone()
		expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(fitted.width, 0)
		await closeLightbox()
		expect(item.contains(video)).toBe(true)
		expect(video.paused).toBe(true)
	},
)

it('leaves gestures on the video control bar to the controls', async () => {
	const { player } = await open()
	await pinch(2)
	lift()
	const before = currentLayer().getBoundingClientRect()
	const button = query(player, 'media-play-button')
	const { x, y } = middleOf(button)
	pointer('pointerdown', 1, x, y, button)
	pointer('pointerdown', 2, x + 20, y, button)
	pointer('pointermove', 1, x - 40, y, button)
	pointer('pointermove', 2, x + 60, y, button)
	await frames()
	lift()
	expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(before.toJSON())
})

it('pinches a native-controls video without taking a single-finger control gesture', async () => {
	const fixture = mount(
		playerItem(
			'<video controls muted playsinline src="/media/loop.mp4" style="width:320px;aspect-ratio:16/9"></video>',
		),
	)
	const video = query(fixture, 'video', HTMLVideoElement)
	await waitForMedia(video)
	await openLightbox(boxes(fixture)[0]!)
	const fitted = currentLayer().getBoundingClientRect()
	const { x, y } = middleOf(currentStage())
	pointer('pointerdown', 1, x - 50, y, video)
	pointer('pointerdown', 2, x + 50, y, video)
	pointer('pointermove', 1, x - 100, y, video)
	pointer('pointermove', 2, x + 100, y, video)
	await frames()
	lift()
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(fitted.width * 2, 0)
	const before = currentLayer().getBoundingClientRect()
	pointer('pointerdown', 1, x, y, video)
	pointer('pointermove', 1, x + 80, y, video)
	await frames()
	lift()
	expect(currentLayer().getBoundingClientRect().toJSON()).toEqual(before.toJSON())
	expect(video.controls).toBe(true)
	expect(video.paused).toBe(true)
})

it('pinches video with native touch input without toggling playback', async ({ skip }) => {
	const { video } = await open()
	const { width } = currentLayer().getBoundingClientRect()
	const { x, y } = middleOf(currentStage())
	const first = { id: 1, x: x - 60, y }
	const second = { id: 2, x: x + 60, y }
	if (!(await commands.touchContacts([first, second]))) {
		skip()
		return
	}

	first.x -= 60
	second.x += 60
	await commands.touchContacts([first, second])
	await frames()
	await commands.touchContacts([])
	expect(currentLayer().getBoundingClientRect().width).toBeCloseTo(width * 2, 0)
	expect(video.paused).toBe(true)
	expect(viewer().open).toBe(true)
})
