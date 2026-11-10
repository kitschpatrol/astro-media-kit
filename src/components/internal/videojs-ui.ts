/**
 * Registers the Video.js custom elements composed by VideoPlayer.astro, whose
 * original player also travels into the lightbox. Registered after the player
 * and container, from the constructors, so a shared Astro chunk never registers
 * an element twice, and the order stays the same on every page.
 */
import {
	BufferingIndicatorElement,
	CaptionsButtonElement,
	ControlsContentElement,
	ControlsElement,
	ControlsGroupElement,
	DialogBackdropElement,
	DialogCloseElement,
	DialogDescriptionElement,
	DialogPopupElement,
	DialogTitleElement,
	ErrorDialogElement,
	FullscreenButtonElement,
	GestureElement,
	HotkeyElement,
	PlayButtonElement,
	PosterElement,
	SliderBufferElement,
	SliderFillElement,
	SliderThumbElement,
	SliderTrackElement,
	SliderValueElement,
	StatusAnnouncerElement,
	TimeElement,
	TimeGroupElement,
	TimeSeparatorElement,
	TimeSliderElement,
	TooltipElement,
	TooltipGroupElement,
	TooltipLabelElement,
	TooltipShortcutElement,
	VolumePopoverElement,
	VolumeSliderElement,
} from '@videojs/html'
import { defineElements } from './videojs-player'
import './videojs-controls'
import './videojs-mute-button'

// The constructors come from the public API without registration side effects.
// Providers precede their parts, including controls and tooltip context, as a
// stable order; Video.js 10.3 also delivers context to parts connected first.
defineElements([
	ControlsElement,
	ErrorDialogElement,
	TimeGroupElement,
	TimeSliderElement,
	TooltipGroupElement,
	VolumeSliderElement,
	BufferingIndicatorElement,
	CaptionsButtonElement,
	ControlsContentElement,
	ControlsGroupElement,
	DialogBackdropElement,
	DialogCloseElement,
	DialogDescriptionElement,
	DialogPopupElement,
	DialogTitleElement,
	FullscreenButtonElement,
	GestureElement,
	HotkeyElement,
	PlayButtonElement,
	PosterElement,
	SliderBufferElement,
	SliderFillElement,
	SliderThumbElement,
	SliderTrackElement,
	SliderValueElement,
	StatusAnnouncerElement,
	TimeElement,
	TimeSeparatorElement,
	TooltipElement,
	TooltipLabelElement,
	TooltipShortcutElement,
	VolumePopoverElement,
])
