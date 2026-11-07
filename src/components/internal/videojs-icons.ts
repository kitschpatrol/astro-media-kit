import {
	captionsOffIcon,
	captionsOnIcon,
	checkIcon,
	fullscreenEnterIcon,
	fullscreenExitIcon,
	pauseIcon,
	playIcon,
	registerIcons,
	restartIcon,
	seekIcon,
	spinnerIcon,
	volumeHighIcon,
	volumeLowIcon,
	volumeOffIcon,
} from '@videojs/html/icons'
import { expandIcon } from './expand-icon'
import { subscribeMediaTheme } from './media-theme'

// A private family leaves unrelated Video.js players alone. Register every
// default before overrides: partial families don't fall back in Video.js.
const defaults = {
	'captions-off': captionsOffIcon,
	'captions-on': captionsOnIcon,
	check: checkIcon,
	expand: expandIcon,
	'fullscreen-enter': fullscreenEnterIcon,
	'fullscreen-exit': fullscreenExitIcon,
	pause: pauseIcon,
	play: playIcon,
	restart: restartIcon,
	seek: seekIcon,
	spinner: spinnerIcon,
	'volume-high': volumeHighIcon,
	'volume-low': volumeLowIcon,
	'volume-off': volumeOffIcon,
}

subscribeMediaTheme((icons) => {
	registerIcons('amk', { ...defaults, ...icons })
})
