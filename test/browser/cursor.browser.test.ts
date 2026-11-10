// The cursor shows what a click does, on the page and in the viewer, and the
// custom properties change it in both.

import { afterEach, expect, it } from 'vitest'
import { commands } from 'vitest/browser'
import { openLightbox } from '../../src/components/internal/lightbox/lightbox'
import {
	block,
	boxes,
	cleanUp,
	clickSubject,
	clickViewerAt,
	currentLayer,
	currentStage,
	item,
	link,
	middleOf,
	mount,
	query,
	setUpLightbox,
	viewer,
	zoomable,
} from './helpers'

setUpLightbox()
afterEach(cleanUp)

function cursorOf(element: Element): string {
	return getComputedStyle(element).cursor
}

it('shows that a click closes a fit subject, and brings it back while it closes', async () => {
	const fixture = mount(`<figure>${zoomable('fit')}<figcaption>Caption</figcaption></figure>`)
	expect(cursorOf(boxes(fixture)[0]!)).toBe('zoom-in')
	await openLightbox(boxes(fixture)[0]!)
	expect(cursorOf(currentLayer())).toBe('zoom-out')
	expect(cursorOf(currentStage())).toBe('zoom-out')
	expect(cursorOf(query(viewer(), '.amk-lightbox-caption'))).toBe('auto')

	clickViewerAt(middleOf(currentLayer()))
	expect(viewer().dataset.state).toBe('closing')
	expect(cursorOf(currentLayer())).toBe('zoom-in')
})

it('shows that a click zooms a subject in from the moment it opens, and back out', async () => {
	const fixture = mount(zoomable('native'))
	const opening = openLightbox(boxes(fixture)[0]!)
	expect(cursorOf(currentLayer())).toBe('zoom-in')
	await opening
	expect(cursorOf(currentLayer())).toBe('zoom-in')
	expect(cursorOf(currentStage())).toBe('zoom-out')

	await clickSubject(0.5, 0.5)
	expect(viewer().querySelector('[data-zoomed]')).not.toBeNull()
	expect(cursorOf(currentLayer())).toBe('zoom-out')
	expect(cursorOf(currentStage())).toBe('zoom-out')
})

it('shows that a click closes a subject that zooming would hardly enlarge', async () => {
	const fixture = mount(
		item(
			'<img src="/media/tile-480.jpg" alt="" width="480" height="480" style="width: 100%; height: auto" />',
			'data-level="native" data-native-width="480" style="width: 240px"',
		),
	)
	await openLightbox(boxes(fixture)[0]!)
	expect(cursorOf(currentLayer())).toBe('zoom-out')
})

it('grabs while the track is dragged, even over a subject that zooms', async () => {
	const fixture = mount(zoomable('native') + zoomable('native', 'aurora', 1600))
	await openLightbox(boxes(fixture)[0]!)
	const { x, y } = middleOf(currentLayer())
	try {
		await commands.mouseDown(x, y)
		await commands.mouseMove(x - 120, y)
		await expect.poll(() => cursorOf(currentLayer())).toBe('grabbing')
	} finally {
		await commands.mouseUp()
	}
})

it('keeps its cursor on items the page styles as links, and text links keep theirs', () => {
	const fixture = mount(`
		<style>a { cursor: pointer }</style>
		${link('#tile', block('linked'))}
		<a class="amk-zoom amk-zoom-link" href="#text">Text link<template>${block('text')}</template></a>`)
	const [linked, text] = boxes(fixture)
	expect(cursorOf(linked!)).toBe('zoom-in')
	expect(cursorOf(text!)).toBe('pointer')
})

it('takes its cursors from the custom properties, on the page and in the viewer', async () => {
	const fixture = mount(zoomable('fit'))
	const root = document.documentElement.style
	root.setProperty('--amk-zoom-in-cursor', 'pointer')
	root.setProperty('--amk-zoom-out-cursor', 'crosshair')
	try {
		expect(cursorOf(boxes(fixture)[0]!)).toBe('pointer')
		await openLightbox(boxes(fixture)[0]!)
		expect(cursorOf(currentLayer())).toBe('crosshair')
		clickViewerAt(middleOf(currentLayer()))
		expect(cursorOf(currentLayer())).toBe('pointer')
	} finally {
		root.removeProperty('--amk-zoom-in-cursor')
		root.removeProperty('--amk-zoom-out-cursor')
	}
})
