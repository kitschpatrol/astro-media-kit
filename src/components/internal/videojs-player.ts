/**
 * Registers `<video-player>` and `<media-container>`. Imported first by every
 * client script that registers a Video.js element, because Astro hoists and
 * orders component scripts independently of the markup: a media element or
 * control that upgrades before its player is defined dispatches its context
 * request into the void and never attaches.
 */
import { ContainerElement } from '@videojs/html'
import { VideoPlayerElement } from '@videojs/html/video'
import './videojs-move'

// Register explicitly: shared chunks may evaluate side-effect registration
// imports before their importer's dependencies, including this player.
for (const element of [VideoPlayerElement, ContainerElement]) {
	if (!customElements.get(element.tagName)) {
		customElements.define(element.tagName, element)
	}
}
