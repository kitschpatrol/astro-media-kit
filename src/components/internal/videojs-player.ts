/**
 * Registers both player providers and `<media-container>`. Imported first by
 * every client script that registers a Video.js element: Astro hoists and
 * orders component scripts independently of the markup, and registering
 * providers before their parts keeps the upgrade order the same on every page.
 * Video.js 10.3 delivers context to a part that connects first as well.
 */
import { ContainerElement } from '@videojs/html'
import { AudioPlayerElement } from '@videojs/html/audio'
import { VideoPlayerElement } from '@videojs/html/video'
import './videojs-move'

type ElementDefinition = CustomElementConstructor & { readonly tagName: string }

/**
 * Register the elements that aren't registered yet, in the given order:
 * providers before their parts.
 */
export function defineElements(elements: ElementDefinition[]) {
	for (const element of elements) {
		if (!customElements.get(element.tagName)) {
			customElements.define(element.tagName, element)
		}
	}
}

// Register explicitly: shared chunks may evaluate side-effect registration
// imports before their importer's dependencies, including this player.
defineElements([VideoPlayerElement, AudioPlayerElement, ContainerElement])
