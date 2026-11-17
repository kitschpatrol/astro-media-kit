import { afterEach, expect, it } from 'vitest'
import { containPageScroll } from '../../src/components/internal/lightbox/scroll-boundary'

const dialogs: HTMLDialogElement[] = []
afterEach(() => {
	for (const dialog of dialogs.splice(0)) {
		dialog.close()
		dialog.remove()
	}
})

function fixture() {
	const dialog = document.createElement('dialog')
	dialog.innerHTML = `<div class="amk-lightbox-track" style="width:200px;overflow:auto">
		<div style="width:600px"><div class="inner" style="width:200px;height:150px;overflow:auto;overscroll-behavior:contain">
			<div style="height:600px">Scrollable image or caption</div>
		</div></div>
	</div>`
	document.body.append(dialog)
	dialogs.push(dialog)
	containPageScroll(dialog)
	dialog.showModal()
	return {
		inner: dialog.querySelector<HTMLElement>('.inner')!,
		track: dialog.querySelector<HTMLElement>('.amk-lightbox-track')!,
	}
}

function touch(target: HTMLElement, type: string, points: Array<[x: number, y: number]>) {
	const event = new Event(type, { bubbles: true, cancelable: true })
	Object.defineProperty(event, 'touches', {
		value: points.map(([clientX, clientY], identifier) => ({ clientX, clientY, identifier })),
	})
	target.dispatchEvent(event)
	return event.defaultPrevented
}

it('contains two-finger movement without allowing the outer track to scroll', () => {
	const { track } = fixture()
	touch(track, 'touchstart', [
		[100, 100],
		[160, 100],
	])
	expect(
		touch(track, 'touchmove', [
			[80, 100],
			[140, 100],
		]),
	).toBe(true)
	expect(
		touch(track, 'touchmove', [
			[80, 80],
			[140, 80],
		]),
	).toBe(true)
})

it('allows two-finger inner scrolling and contains it at either edge', () => {
	const { inner } = fixture()
	touch(inner, 'touchstart', [
		[60, 100],
		[120, 100],
	])
	expect(
		touch(inner, 'touchmove', [
			[60, 80],
			[120, 80],
		]),
	).toBe(false)
	inner.scrollTop = inner.scrollHeight
	expect(
		touch(inner, 'touchmove', [
			[60, 60],
			[120, 60],
		]),
	).toBe(true)
	expect(
		touch(inner, 'touchmove', [
			[60, 80],
			[120, 80],
		]),
	).toBe(false)
	inner.scrollTop = 0
	expect(
		touch(inner, 'touchmove', [
			[60, 100],
			[120, 100],
		]),
	).toBe(true)
})

it('rebases remaining fingers after a release and forgets cancelled contacts', () => {
	const { inner } = fixture()
	touch(inner, 'touchstart', [
		[60, 100],
		[120, 20],
	])
	touch(inner, 'touchend', [[60, 100]])
	// This moves upward from the surviving finger, despite lying below the old
	// centroid. At the top of the content, only the upward move may scroll.
	expect(touch(inner, 'touchmove', [[60, 90]])).toBe(false)
	touch(inner, 'touchcancel', [])
	expect(touch(inner, 'touchmove', [[60, 100]])).toBe(false)
	touch(inner, 'touchstart', [[60, 100]])
	expect(touch(inner, 'touchmove', [[60, 110]])).toBe(true)
})
