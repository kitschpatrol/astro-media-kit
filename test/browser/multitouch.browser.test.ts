import { afterEach, expect, it } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	activeSlideLabel,
	boxes,
	cleanUp,
	currentLayer,
	frames,
	gallery,
	middleOf,
	mount,
	query,
	setUpLightbox,
	viewer,
} from './helpers'

setUpLightbox()
afterEach(async () => {
	await commands.touchContacts([])
	await cleanUp()
})

/** Exercise touch bookkeeping even in engines without native touch injection. */
function touch(target: Element, type: string, identifiers: number[]) {
	const event = new Event(type, { bubbles: true })
	Object.defineProperty(event, 'touches', {
		value: identifiers.map((identifier) => ({ identifier })),
	})
	target.dispatchEvent(event)
}

it('delivers separate native starts and ends for individual fingers', async ({ skip }) => {
	const fixture = mount('<div style="position:fixed;inset:0;touch-action:none"></div>')
	const target = query(fixture, 'div')
	const events: string[] = []
	const record = (event: TouchEvent) => {
		events.push(`${event.type}:${event.touches.length}`)
	}

	target.addEventListener('touchstart', record)
	target.addEventListener('touchend', record)
	const first = { id: 1, x: 300, y: 300 }
	if (!(await commands.touchContacts([first]))) {
		skip()
		return
	}

	const second = { id: 2, x: 400, y: 300 }
	await commands.touchContacts([first, second])
	await commands.touchContacts([second])
	await commands.touchContacts([])
	expect(events).toEqual(['touchstart:1', 'touchstart:2', 'touchend:1', 'touchend:0'])
})

it.each(['touchend', 'touchcancel'])(
	'recovers navigation when the final %s is outside the track',
	async (ending) => {
		const fixture = mount(gallery(['a', 'b', 'c']))
		await openLightbox(boxes(fixture)[0]!)
		const layer = currentLayer()
		const previous = query(viewer(), '.amk-lightbox-previous')
		touch(layer, 'touchstart', [1])
		touch(previous, 'touchstart', [1, 2])
		touch(layer, ending, [2])
		touch(previous, ending, [])

		await userEvent.click(query(viewer(), '.amk-lightbox-next'))
		await expect.poll(activeSlideLabel).toBe('2 of 3')
	},
)

it('recovers after native fingers lift from the image and a gallery button', async ({ skip }) => {
	const fixture = mount(gallery(['a', 'b', 'c']))
	await openLightbox(boxes(fixture)[0]!)
	const first = { ...middleOf(currentLayer()), id: 1 }
	const second = { ...middleOf(query(viewer(), '.amk-lightbox-previous')), id: 2 }
	if (!(await commands.touchContacts([first]))) {
		skip()
	}

	await commands.touchContacts([first, second])
	await commands.touchContacts([second])
	await commands.touchContacts([])
	await userEvent.click(query(viewer(), '.amk-lightbox-next'))
	await expect.poll(activeSlideLabel).toBe('2 of 3')
})

it('cancels a dismiss when a second finger lands on a gallery button', async ({ skip }) => {
	const fixture = mount(gallery(['a', 'b', 'c']))
	await openLightbox(boxes(fixture)[0]!)
	const origin = currentLayer().getBoundingClientRect().y
	const first = { ...middleOf(currentLayer()), id: 1 }
	const second = { ...middleOf(query(viewer(), '.amk-lightbox-previous')), id: 2 }
	if (!(await commands.touchContacts([first]))) {
		skip()
	}

	first.y += 60
	await commands.touchContacts([first])
	await expect.poll(() => Object.hasOwn(viewer().dataset, 'dismissing')).toBe(true)
	await commands.touchContacts([first, second])
	await expect.poll(() => Object.hasOwn(viewer().dataset, 'dismissing')).toBe(false)
	await commands.touchContacts([first])
	first.y += 80
	await commands.touchContacts([first])
	await commands.touchContacts([])
	await frames()
	expect(viewer().open).toBe(true)
	await expect.poll(() => currentLayer().getBoundingClientRect().y).toBeCloseTo(origin, 0)
	await userEvent.click(query(viewer(), '.amk-lightbox-next'))
	await expect.poll(activeSlideLabel).toBe('2 of 3')
})
