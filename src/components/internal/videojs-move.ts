/**
 * Lets Video.js elements keep their state through a move with `moveBefore()`,
 * as the lightbox lifts a player and puts it back. A custom element without a
 * `connectedMoveCallback` is disconnected and connected again by such a move,
 * and Video.js's elements set up their popovers and listeners on connection
 * without taking the earlier ones down, so a volume popover moved that way runs
 * twice over, opening and closing itself. The callback is read from the
 * prototype chain as each element is defined, so it goes on the base class
 * before any element is.
 */
import { UIElement } from '@videojs/html'

Object.defineProperty(UIElement.prototype, 'connectedMoveCallback', {
	configurable: true,
	value() {
		// The element has moved, and goes on as it was
	},
	writable: true,
})
