// Fade changed controls individually: layering two half-opacity copies of the
// same glyph dims it, even when the bar's background stays constant.
const cells = '.amk-bar :is(.amk-button, .amk-time, .amk-time-slider)'
const baseOpacities = new WeakMap<HTMLElement, string>()

const paintProperties = [
	'background',
	'border',
	'border-radius',
	'box-shadow',
	'clip-path',
	'color',
	'fill',
	'fill-opacity',
	'fill-rule',
	'filter',
	'font',
	'letter-spacing',
	'mask-image',
	'outline',
	'rotate',
	'scale',
	'stroke',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-opacity',
	'stroke-width',
	'text-decoration',
	'transform',
	'translate',
]

/** Capture fully visible controls before another bar takes over their space. */
export function steadyControls(controls: HTMLElement): Set<string> {
	return getComputedStyle(controls).opacity === '1'
		? new Set(
				[...controls.querySelectorAll<HTMLElement>(cells)]
					.filter(
						(cell) =>
							cell.checkVisibility() && getComputedStyle(cell).opacity === baseOpacity(cell),
					)
					.map((cell) => appearance(cell)),
			)
		: new Set()
}

/** Start or reverse a bar's individual control fades. */
export function fadeControls(controls: HTMLElement, incoming: boolean) {
	const current = Array.from(controls.querySelectorAll<HTMLElement>(cells), (cell) => ({
		cell,
		opacity: baseOpacity(cell),
	}))
	for (const { cell, opacity } of current) {
		baseOpacities.set(cell, opacity)
		cell.style.setProperty('--amk-control-base-opacity', opacity)
		cell.dataset.controlFade = incoming ? 'in' : 'out'
		cell.style.removeProperty('--amk-control-fade-opacity')
	}
}

/** Transfer identical artwork once, without layering partially opaque copies. */
export function preserveControls(
	steady: Set<string>,
	incoming: HTMLElement,
	outgoing: HTMLElement[],
) {
	const previous = outgoing.flatMap((controls) =>
		[...controls.querySelectorAll<HTMLElement>(cells)]
			.filter((cell) => cell.checkVisibility())
			.map((cell) => ({ cell, paint: appearance(cell) })),
	)
	// Read all presentation before writing any state, avoiding repeated layouts.
	const current = [...incoming.querySelectorAll<HTMLElement>(cells)]
		.filter((cell) => cell.checkVisibility())
		.map((cell) => ({ cell, paint: appearance(cell) }))
	for (const { cell, paint } of current) {
		if (!steady.has(paint)) {
			continue
		}

		cell.dataset.controlFade = 'steady-in'
		for (const other of previous) {
			if (other.paint === paint) {
				other.cell.dataset.controlFade = 'steady-out'
			}
		}
	}
}

/** Freeze interrupted cell fades while the whole bar exits. */
export function freezeControlFades(controls: HTMLElement) {
	const current = Array.from(
		controls.querySelectorAll<HTMLElement>('[data-control-fade]'),
		(cell) => ({
			cell,
			opacity: getComputedStyle(cell).opacity,
		}),
	)
	for (const { cell, opacity } of current) {
		cell.style.setProperty('--amk-control-fade-opacity', opacity)
		cell.dataset.controlFade = 'frozen'
	}
}

/** Restore ordinary control styling after a swap or return to the page. */
export function clearControlFades(controls: HTMLElement) {
	for (const cell of controls.querySelectorAll<HTMLElement>('[data-control-fade]')) {
		delete cell.dataset.controlFade
		baseOpacities.delete(cell)
		cell.style.removeProperty('--amk-control-base-opacity')
		cell.style.removeProperty('--amk-control-fade-opacity')
	}
}

function appearance(cell: HTMLElement): string {
	const nodes: unknown[] = []
	const visit = (node: Element) => {
		const style = getComputedStyle(node)
		if (style.display === 'none' || (node !== cell && style.opacity === '0')) {
			return
		}

		// SVG paths do not have CSS boxes, so checkVisibility would omit their
		// geometry and incorrectly equate different icons, such as play/pause.
		if (style.visibility === 'visible') {
			const bounds = node.getBoundingClientRect()
			const geometry =
				node instanceof SVGElement
					? [...node.attributes]
							.filter(
								({ name }) =>
									!['class', 'id', 'role', 'style'].includes(name) && !name.startsWith('aria-'),
							)
							.map(({ name, value }) => [name, value])
					: []
			nodes.push([
				node.localName,
				[bounds.x, bounds.y, bounds.width, bounds.height],
				paintProperties.map((property) => style.getPropertyValue(property)),
				// Compare authored opacity, independent of the temporary swap fade.
				node === cell ? baseOpacity(cell) : style.opacity,
				geometry,
				Array.from(node.childNodes, (child) =>
					child.nodeType === Node.TEXT_NODE ? child.textContent?.trim() : '',
				).join(''),
			])
		}

		for (const child of node.children) {
			visit(child)
		}
	}

	visit(cell)
	return JSON.stringify([cell.localName, cell.className, nodes])
}

function baseOpacity(cell: HTMLElement): string {
	return baseOpacities.get(cell) ?? getComputedStyle(cell).opacity
}
