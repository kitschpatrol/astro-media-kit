import type { Frame } from 'playwright'
import type { ViteUserConfig } from 'vitest/config'
import { defineBrowserCommand, playwright } from '@vitest/browser-playwright'
import { configDefaults, defineConfig } from 'vitest/config'
import { buildFixture } from './test/parity/helpers/build-fixture.ts'

const emulateReducedMotion = defineBrowserCommand<[isReduced: boolean]>(
	async (context, isReduced) => {
		await context.page.emulateMedia({ reducedMotion: isReduced ? 'reduce' : 'no-preference' })
	},
)

/** Where a point in the test page's viewport is in the browser window. */
async function toWindow(frame: Frame, x: number, y: number): Promise<{ x: number; y: number }> {
	const element = await frame.frameElement()
	const box = (await element.boundingBox()) ?? undefined
	if (box === undefined) {
		throw new Error('The test page is not showing, so the mouse cannot reach it')
	}

	const scale = box.width / (await frame.evaluate(() => window.innerWidth))
	return { x: box.x + x * scale, y: box.y + y * scale }
}

/** Press the mouse at a point in the test page's viewport. */
const mouseDown = defineBrowserCommand<[x: number, y: number]>(async (context, x, y) => {
	const point = await toWindow(await context.frame(), x, y)
	await context.page.mouse.move(point.x, point.y)
	await context.page.mouse.down()
})

/** Glide the mouse to a point in the test page's viewport, as a hand would. */
const mouseMove = defineBrowserCommand<[x: number, y: number]>(async (context, x, y) => {
	const point = await toWindow(await context.frame(), x, y)
	await context.page.mouse.move(point.x, point.y, { steps: 8 })
})

/**
 * Release the mouse where it is, or glide it to a point in the test page's
 * viewport first and release it still moving.
 */
const mouseUp = defineBrowserCommand<[x?: number, y?: number, steps?: number]>(
	async (context, x, y, steps = 8) => {
		if (x !== undefined && y !== undefined) {
			const point = await toWindow(await context.frame(), x, y)
			await context.page.mouse.move(point.x, point.y, { steps })
		}

		await context.page.mouse.up()
	},
)

/**
 * Release a native flick with an input clock independent of the runner's frame
 * rate.
 */
const mouseFlick = defineBrowserCommand<[x: number, y: number]>(async (context, x, y) => {
	const frame = await context.frame()
	const point = await toWindow(frame, x, y)
	const clock = await frame.evaluateHandle(() => {
		const controller = new AbortController()
		let time = performance.now()
		const stamp = (event: PointerEvent) => {
			time += 16
			Object.defineProperty(event, 'timeStamp', { value: time })
		}

		// Keep native hit testing and pointer capture, while specifying a quick
		// gesture even when a busy CI runner takes longer to dispatch its events.
		for (const type of ['pointermove', 'pointerup'] as const) {
			document.addEventListener(type, stamp, { capture: true, signal: controller.signal })
		}

		return controller
	})
	try {
		await context.page.mouse.move(point.x, point.y, { steps: 2 })
		await context.page.mouse.up()
	} finally {
		await clock.evaluate((controller) => {
			controller.abort()
		})
		await clock.dispose()
	}
})

/**
 * Deliver actual wheel input through the browser, including its native
 * snapping.
 */
const mouseWheel = defineBrowserCommand<[deltaX: number, deltaY: number]>(
	async (context, deltaX, deltaY) => {
		const point = await toWindow(await context.frame(), 640, 400)
		await context.page.mouse.move(point.x, point.y)
		await context.page.mouse.wheel(deltaX, deltaY)
	},
)

/** Chromium exposes native touch dragging through its browser protocol. */
const touchSwipe = defineBrowserCommand<[direction?: 'down' | 'left' | 'up']>(
	async (context, direction = 'left') => {
		if (context.page.context().browser()?.browserType().name() !== 'chromium') {
			return false
		}

		const session = await context.page.context().newCDPSession(context.page)
		const start = await toWindow(await context.frame(), direction === 'left' ? 1000 : 640, 400)
		const end = await toWindow(
			await context.frame(),
			direction === 'left' ? 200 : 640,
			direction === 'left' ? 400 : direction === 'up' ? 150 : 650,
		)
		try {
			await session.send('Emulation.setTouchEmulationEnabled', { enabled: true })
			await session.send('Input.dispatchTouchEvent', {
				touchPoints: [{ ...start, id: 1 }],
				type: 'touchStart',
			})
			for (let i = 1; i <= 12; i++) {
				await session.send('Input.dispatchTouchEvent', {
					touchPoints: [
						{
							id: 1,
							x: start.x + ((end.x - start.x) * i) / 12,
							y: start.y + ((end.y - start.y) * i) / 12,
						},
					],
					type: 'touchMove',
				})
				await new Promise<void>((resolve) => {
					setTimeout(resolve, 16)
				})
			}

			await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' })
		} finally {
			await session.send('Emulation.setTouchEmulationEnabled', { enabled: false })
			await session.detach()
		}

		return true
	},
)

export default defineConfig(async (): Promise<ViteUserConfig> => {
	// Built before any server starts: Vite lists the public directory once, on
	// start, so the browser project serves the fixture's pages and assets from
	// its first request. Unit tests rebuild dist while browser tests run, so
	// serve a separate build.
	const { dist } = await buildFixture('core-image', '.vitest/dist')
	return {
		test: {
			projects: [
				{
					test: {
						exclude: [...configDefaults.exclude, 'test/**/*.browser.test.ts'],
						fileParallelism: false,
						hookTimeout: 120_000,
						include: ['test/**/*.test.ts'],
						name: 'unit',
						testTimeout: 60_000,
					},
				},
				{
					// Found up front, so Vite never re-optimizes and reloads mid-run
					optimizeDeps: { entries: ['test/**/*.browser.test.ts'] },
					publicDir: dist,
					test: {
						browser: {
							commands: {
								emulateReducedMotion,
								mouseDown,
								mouseFlick,
								mouseMove,
								mouseUp,
								mouseWheel,
								touchSwipe,
							},
							enabled: true,
							headless: true,
							instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
							provider: playwright(),
							viewport: { width: 1280, height: 800 },
						},
						// Source selection, decoding, and native scrolling can outlast the
						// default one-second poll on hosted runners.
						expect: { poll: { timeout: 5000 } },
						// Native input tests must not compete for browser focus across files.
						fileParallelism: false,
						include: ['test/**/*.browser.test.ts'],
						name: 'browser',
					},
				},
			],
		},
	}
})
