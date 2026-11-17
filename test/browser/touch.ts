import { currentLayer, currentStage, frames, middleOf } from './helpers'

/** Dispatch a touch pointer in engines without native multi-finger injection. */
export function pointer(
	type: string,
	id: number,
	x: number,
	y: number,
	target: Element = currentLayer(),
) {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			button: 0,
			buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
			cancelable: true,
			clientX: x,
			clientY: y,
			isPrimary: id === 1,
			pointerId: id,
			pointerType: 'touch',
		}),
	)
}

/** Pinch around the stage's center, leaving both contacts held. */
export async function pinch(scale: number) {
	const { x, y } = middleOf(currentStage())
	pointer('pointerdown', 1, x - 50, y)
	pointer('pointerdown', 2, x + 50, y)
	pointer('pointermove', 1, x - 50 * scale, y)
	pointer('pointermove', 2, x + 50 * scale, y)
	await frames()
	return { x, y }
}

/** Release both synthetic fingers at their last sampled positions. */
export function lift() {
	pointer('pointerup', 1, 0, 0)
	pointer('pointerup', 2, 0, 0)
}
