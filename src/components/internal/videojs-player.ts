/**
 * Registers `<video-player>` and `<media-container>`. Imported first by every
 * client script that registers a Video.js element, because Astro hoists and
 * orders component scripts independently of the markup: a media element or
 * control that upgrades before its player is defined dispatches its context
 * request into the void and never attaches.
 */
import '@videojs/html/video/player'
import '@videojs/html/ui/container'
