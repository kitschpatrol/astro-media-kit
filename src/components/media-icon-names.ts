/** Decorative icons shared by media players, carousels, and the lightbox. */
export const mediaIconNames = [
	'play',
	'pause',
	'restart',
	'volume-off',
	'volume-low',
	'volume-high',
	'captions-off',
	'captions-on',
	'fullscreen-enter',
	'fullscreen-exit',
	'expand',
	'spinner',
	'seek',
	'check',
	'close',
	'previous',
	'next',
	'zoom-in',
	'zoom-out',
] as const

export type MediaIconName = (typeof mediaIconNames)[number]
