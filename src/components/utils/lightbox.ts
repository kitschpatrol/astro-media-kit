import { initLiftbox } from 'liftbox'
import { createControlsActivity } from './controls-activity'

// One controller per page, including Astro client-side navigation.
let dispose = initLiftbox()
document.addEventListener('astro:before-swap', () => {
	dispose()
})
document.addEventListener('astro:page-load', () => {
	dispose = initLiftbox()
})

// Float the existing controls without creating another player or media source.
let activeSubject: HTMLElement | undefined
let activeControls: HTMLElement | undefined
let activity: ReturnType<typeof createControlsActivity> | undefined

function releaseControls() {
	activity?.destroy()
	activity = undefined
	if (activeControls !== undefined) {
		if (activeControls.matches(':popover-open')) {
			activeControls.hidePopover()
		}

		activeControls.removeAttribute('popover')
	}

	activeControls = undefined
	activeSubject = undefined
}

document.addEventListener('liftbox:change', (event) => {
	releaseControls()
	if (!(event.target instanceof HTMLElement)) {
		return
	}

	const controls = event.target.querySelector<HTMLElement>(':scope video-player .amk-controls')
	const viewer = event.target.closest<HTMLElement>('.liftbox')
	if (controls === null || viewer === null) {
		return
	}

	activeSubject = event.target
	activeControls = controls
	controls.popover = 'manual'
	controls.showPopover()
	activity = createControlsActivity(viewer)
	activity.setControls(controls)
})
document.addEventListener('liftbox:restore', (event) => {
	if (event.target === activeSubject) {
		releaseControls()
	}
})
