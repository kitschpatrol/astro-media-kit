import type { CDPSession, Page } from 'playwright'
import { defineBrowserCommand } from '@vitest/browser-playwright'

export type MobileAction =
	| { dx: number; dy: number; fingers?: number; type: 'drag'; x: number; y: number }
	| { height: number; type: 'resize'; width: number }
	| { index?: number; type: 'open' }
	| { scale: number; type: 'pinch' | 'scale' }
	| { type: 'close' | 'inline' | 'next' | 'zoom' }

export type MobileSnapshot = Awaited<ReturnType<typeof snapshot>>

/**
 * Exercise a real top-level mobile page. The browser test runner uses an
 * iframe, whose VisualViewport does not report native page zoom or panning.
 */
export const mobileGallery = defineBrowserCommand<
	[actions: MobileAction[], size?: { width: number; height: number }]
>(async (context, actions, size) => {
	const browser = context.page.context().browser()
	if (browser === null) {
		return false
	}

	const name = browser.browserType().name()
	const needsNativeTouch = actions.some(({ type }) => ['drag', 'pinch', 'scale'].includes(type))
	if (needsNativeTouch && name !== 'chromium') {
		return false
	}

	const mobile = await browser.newContext({
		deviceScaleFactor: 2,
		hasTouch: true,
		isMobile: name !== 'firefox',
		viewport: size ?? { width: 820, height: 1180 },
	})
	mobile.setDefaultTimeout(5000)
	try {
		const page = await mobile.newPage()
		const errors: Error[] = []
		page.on('pageerror', (error) => {
			errors.push(error)
		})
		const frame = await context.frame()
		await page.goto(new URL('/mobile-gallery/index.html', frame.url()).href)
		const session = needsNativeTouch ? await mobile.newCDPSession(page) : undefined
		const states: MobileSnapshot[] = []
		for (const action of actions) {
			await perform(page, action, session)
			if (errors.length > 0) {
				throw new AggregateError(errors, 'The mobile fixture raised page errors')
			}

			await page.waitForFunction(() =>
				document.getAnimations().every((animation) => animation.playState !== 'running'),
			)
			await page.waitForFunction(
				() =>
					document.querySelector(
						'.amk-carousel-track[data-moving], .amk-lightbox-track[data-moving], .amk-lightbox-stage[data-panning]',
					) === null,
			)
			await page.evaluate(async () => {
				for (let i = 0; i < 2; i++) {
					await new Promise((resolve) => {
						requestAnimationFrame(resolve)
					})
				}
			})
			states.push(await snapshot(page))
		}

		return states
	} finally {
		await mobile.close()
	}
})

async function perform(page: Page, action: MobileAction, session: CDPSession | undefined) {
	if (action.type === 'close' || action.type === 'next' || action.type === 'zoom') {
		await tap(page, `.amk-lightbox-${action.type}`)
		return
	}

	switch (action.type) {
		case 'drag': {
			await drag(session!, action)
			return
		}

		case 'inline': {
			await page.locator('#inline').evaluate((element) => {
				element.scrollIntoView({ block: 'center' })
			})
			return
		}

		case 'open': {
			const opener = page.locator('#gallery .amk-zoom').nth(action.index ?? 0)
			await opener.evaluate((element) => {
				element.scrollIntoView({ block: 'center', inline: 'center' })
			})
			await tap(page, '#gallery .amk-zoom', action.index)
			await page.locator('dialog[open]').waitFor()
			return
		}

		case 'pinch': {
			const point = await page.evaluate(() => ({
				x: (visualViewport?.width ?? innerWidth) / 2,
				y: (visualViewport?.height ?? innerHeight) / 2,
			}))
			await session!.send('Input.synthesizePinchGesture', {
				...point,
				gestureSourceType: 'touch',
				scaleFactor: action.scale,
			})
			return
		}

		case 'resize': {
			await page.setViewportSize({ width: action.width, height: action.height })
			return
		}

		case 'scale': {
			await session!.send('Emulation.setPageScaleFactor', { pageScaleFactor: action.scale })
		}
	}
}

async function tap(page: Page, selector: string, index = 0) {
	const target = page.locator(selector).nth(index)
	if (await page.evaluate(() => (visualViewport?.scale ?? 1) === 1)) {
		await target.tap()
		return
	}

	// The driver's automatic hit testing confuses visual and layout coordinates
	// after a viewport pan. Send a real touchscreen tap in visual coordinates.
	const point = await target.evaluate((element) => {
		const box = element.getBoundingClientRect()
		return {
			x: box.x + box.width / 2 - (visualViewport?.offsetLeft ?? 0),
			y: box.y + box.height / 2 - (visualViewport?.offsetTop ?? 0),
		}
	})
	await page.touchscreen.tap(point.x, point.y)
}

async function drag(session: CDPSession, action: Extract<MobileAction, { type: 'drag' }>) {
	const count = action.fingers ?? 1
	const points = (at: number) =>
		Array.from({ length: count }, (_, id) => ({
			id,
			x: action.x + (id - (count - 1) / 2) * 60 + action.dx * at,
			y: action.y + action.dy * at,
		}))
	await session.send('Input.dispatchTouchEvent', { touchPoints: points(0), type: 'touchStart' })
	for (let i = 1; i <= 12; i++) {
		await session.send('Input.dispatchTouchEvent', {
			touchPoints: points(i / 12),
			type: 'touchMove',
		})
		await new Promise((resolve) => {
			setTimeout(resolve, 24)
		})
	}

	// Stop moving before lifting, so assertions observe a pan without inertia.
	await new Promise((resolve) => {
		setTimeout(resolve, 100)
	})
	await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' })
}

async function snapshot(page: Page) {
	return page.evaluate(() => {
		const dialog = document.querySelector<HTMLDialogElement>('.amk-lightbox')
		const slideState = () => {
			const slide = dialog?.querySelector<HTMLElement>('.amk-lightbox-slide:not([inert])')
			const stage = slide?.querySelector('.amk-lightbox-stage')?.getBoundingClientRect()
			const image = slide?.querySelector('.amk-lightbox-frame')?.getBoundingClientRect()
			return {
				imageWidth: image?.width ?? 0,
				isZoomed: slide?.hasAttribute('data-zoomed') ?? false,
				label: slide?.getAttribute('aria-label') ?? '',
				stageX: (stage?.x ?? 0) - (image?.x ?? 0),
				stageY: (stage?.y ?? 0) - (image?.y ?? 0),
			}
		}

		const box = dialog?.getBoundingClientRect()
		const visible = window.visualViewport!
		const viewport = {
			height: visible.height,
			scale: visible.scale,
			width: visible.width,
			x: visible.offsetLeft,
			y: visible.offsetTop,
		}
		return {
			...slideState(),
			controlsVisible: [
				...(dialog?.querySelectorAll<HTMLElement>('.amk-lightbox-button:not([hidden])') ?? []),
			].every((button) => {
				const rect = button.getBoundingClientRect()
				return (
					rect.left >= viewport.x &&
					rect.top >= viewport.y &&
					rect.right <= viewport.x + viewport.width &&
					rect.bottom <= viewport.y + viewport.height
				)
			}),
			dialog:
				box === undefined
					? undefined
					: { height: box.height, width: box.width, x: box.x, y: box.y },
			inlineOffset: document.querySelector('.amk-carousel-track')?.scrollLeft ?? 0,
			isDismissing: dialog?.hasAttribute('data-dismissing') ?? false,
			isDragging: document.querySelector('.amk-lightbox [data-dragging]') !== null,
			isOpen: dialog?.open ?? false,
			scrollY,
			viewport,
		}
	})
}
