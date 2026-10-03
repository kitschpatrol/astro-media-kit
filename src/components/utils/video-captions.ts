export type CaptionSelection = 'off' | Pick<TextTrack, 'kind' | 'label' | 'language'>

function captionTracks(media: HTMLMediaElement): TextTrack[] {
	return [...media.textTracks].filter(
		(track) => track.kind === 'captions' || track.kind === 'subtitles',
	)
}

/** Capture the selected language, or an explicit captions-off preference. */
export function readCaptionSelection(media: HTMLMediaElement): CaptionSelection {
	const selected = captionTracks(media).find((track) => track.mode === 'showing')
	return selected
		? { kind: selected.kind, label: selected.label, language: selected.language }
		: 'off'
}

/** Restore once tracks are ready, then leave subsequent user choices alone. */
export function restoreCaptionSelection(
	media: HTMLMediaElement,
	selection: CaptionSelection,
): () => void {
	const controller = new AbortController()
	const { signal } = controller
	const cleanup = (): void => {
		controller.abort()
	}

	const apply = (): void => {
		const tracks = captionTracks(media)
		if (tracks.length === 0) {
			return
		}

		const selected =
			selection !== 'off' &&
			tracks.find(
				(track) =>
					track.kind === selection.kind &&
					track.language === selection.language &&
					track.label === selection.label,
			)
		if (selection !== 'off' && (selected === undefined || selected === false)) {
			return
		}

		cleanup()
		for (const track of tracks) {
			track.mode = track === selected ? 'showing' : 'disabled'
		}
	}

	media.addEventListener('loadedmetadata', apply, { signal })
	media.addEventListener('loadcomplete', apply, { signal })
	media.textTracks.addEventListener('addtrack', apply, { signal })
	if (media.readyState >= 1) {
		apply()
	}

	return cleanup
}
