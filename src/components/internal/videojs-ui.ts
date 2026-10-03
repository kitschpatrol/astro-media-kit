/**
 * Registers the Video.js custom elements and icons composed by
 * VideoPlayer.astro and by the lightbox player in utils/lightbox.ts. Every
 * import is side-effect only and defines exactly one element, so this list is
 * the single place that decides which parts of Video.js ship to the client.
 */
import {
	captionsOffIcon,
	captionsOnIcon,
	fullscreenEnterIcon,
	fullscreenExitIcon,
	pauseIcon,
	playIcon,
	registerIcons,
	restartIcon,
	spinnerIcon,
	volumeHighIcon,
	volumeLowIcon,
	volumeOffIcon,
} from '@videojs/html/icons'
import './videojs-player'
import '@videojs/html/ui/buffering-indicator'
import '@videojs/html/ui/captions-button'
import '@videojs/html/ui/controls'
import '@videojs/html/ui/controls-content'
import '@videojs/html/ui/controls-group'
import '@videojs/html/ui/fullscreen-button'
import '@videojs/html/ui/gesture'
import '@videojs/html/ui/hotkey'
import '@videojs/html/ui/mute-button'
import '@videojs/html/ui/play-button'
import '@videojs/html/ui/poster'
import '@videojs/html/ui/slider-buffer'
import '@videojs/html/ui/slider-fill'
import '@videojs/html/ui/slider-thumb'
import '@videojs/html/ui/slider-track'
import '@videojs/html/ui/slider-value'
import '@videojs/html/ui/status-announcer'
import '@videojs/html/ui/time'
import '@videojs/html/ui/time-group'
import '@videojs/html/ui/time-separator'
import '@videojs/html/ui/time-slider'
import '@videojs/html/ui/tooltip'
import '@videojs/html/ui/tooltip-group'
import '@videojs/html/ui/tooltip-label'
import '@videojs/html/ui/tooltip-shortcut'
import '@videojs/html/ui/volume-slider'

// Register the icons the bars use into the `default` family explicitly.
// Registration merges, so this combines with the packaged audio skin (which
// registers its own subset into the same family) regardless of load order.
// The lazy family loader would not run once the audio skin had populated the
// family, leaving the captions and fullscreen icons blank on pages with both.
registerIcons('default', {
	'captions-off': captionsOffIcon,
	'captions-on': captionsOnIcon,
	'fullscreen-enter': fullscreenEnterIcon,
	'fullscreen-exit': fullscreenExitIcon,
	pause: pauseIcon,
	play: playIcon,
	restart: restartIcon,
	spinner: spinnerIcon,
	'volume-high': volumeHighIcon,
	'volume-low': volumeLowIcon,
	'volume-off': volumeOffIcon,
})
