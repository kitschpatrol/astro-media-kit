/**
 * Registers the Video.js custom elements and icons composed by
 * VideoPlayer.astro, whose original player also travels into the lightbox.
 * Register the UI after the player and container. Importing registration entry
 * points lets shared Astro chunks register controls before their context
 * providers, leaving those controls disconnected from player state.
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
import './videojs-controls'
import './videojs-mute-button'
import './videojs-player'
import './videojs-icons'

// The constructors come from the public API without registration side effects.
// Providers precede their parts, including controls and tooltip context.
for (const element of [
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
]) {
	if (!customElements.get(element.tagName)) {
		customElements.define(element.tagName, element)
	}
}
