import { MuteButtonElement } from '@videojs/html'
import './videojs-player'

/**
 * Keep Video.js's mute state, labels, availability, and keyboard behavior, but
 * reserve clicks for mute. In 10.2 the hover popover also installs a click
 * toggle on its trigger, which otherwise dismisses the slider after muting.
 */
class AmkMuteButton extends MuteButtonElement {
	override connectedCallback() {
		super.connectedCallback()
		if (this.destroyed) {
			return
		}

		this.addEventListener('click', this.#handleClick, { capture: true })
	}

	override disconnectedCallback() {
		this.removeEventListener('click', this.#handleClick, { capture: true })
		super.disconnectedCallback()
	}

	readonly #handleClick = (event: MouseEvent) => {
		// Run the inherited action once, before either of the upstream click
		// listeners. Capture keeps this independent of their order after a move.
		event.stopImmediatePropagation()
		if (this.getIsButtonDisabled()) {
			event.preventDefault()
			return
		}

		this.handleActivate(event, event.detail > 0 ? 'pointer' : 'virtual')
	}
}

if (!customElements.get('amk-mute-button')) {
	customElements.define('amk-mute-button', AmkMuteButton)
}
