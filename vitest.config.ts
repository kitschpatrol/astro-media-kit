import type { CDPSession, Frame, Page } from 'playwright'
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

/** Release the mouse where it is. */
const mouseUp = defineBrowserCommand(async (context) => {
	await context.page.mouse.up()
})

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

/**
 * Chromium exposes native touch dragging through its browser protocol. Touch
 * emulation isn't needed for that, and turning it off again would discard
 * Playwright's hover setting for the rest of the run: where the hardware has no
 * mouse, as on Linux runners, nothing could open on hover after that.
 */
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
			await session.detach()
		}

		return true
	},
)

/**
 * Each page's finger that is down, with the protocol session that put it there,
 * which alone can move or lift it, and where it is in the browser window.
 */
const fingers = new WeakMap<Page, { point: { x: number; y: number }; session: CDPSession }>()

function fingerOn(page: Page): { point: { x: number; y: number }; session: CDPSession } {
	const finger = fingers.get(page)
	if (finger === undefined) {
		throw new Error('No finger is down: call touchDown first')
	}

	return finger
}

/**
 * Put a finger down at a point in the test page's viewport, and keep it there.
 * Returns false where the browser has no protocol for it, as `touchSwipe`
 * does.
 */
const touchDown = defineBrowserCommand<[x: number, y: number]>(async (context, x, y) => {
	if (context.page.context().browser()?.browserType().name() !== 'chromium') {
		return false
	}

	const point = await toWindow(await context.frame(), x, y)
	const session = await context.page.context().newCDPSession(context.page)
	fingers.set(context.page, { point, session })
	await session.send('Input.dispatchTouchEvent', {
		touchPoints: [{ ...point, id: 1 }],
		type: 'touchStart',
	})
	return true
})

/**
 * Slide the finger that is down to a point in the test page's viewport, as a
 * hand would.
 */
const touchMove = defineBrowserCommand<[x: number, y: number]>(async (context, x, y) => {
	const finger = fingerOn(context.page)
	const start = finger.point
	const end = await toWindow(await context.frame(), x, y)
	for (let i = 1; i <= 8; i++) {
		finger.point = {
			x: start.x + ((end.x - start.x) * i) / 8,
			y: start.y + ((end.y - start.y) * i) / 8,
		}
		await finger.session.send('Input.dispatchTouchEvent', {
			touchPoints: [{ ...finger.point, id: 1 }],
			type: 'touchMove',
		})
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 16)
		})
	}
})

/** Lift the finger that is down. */
const touchUp = defineBrowserCommand(async (context) => {
	const { session } = fingerOn(context.page)
	fingers.delete(context.page)
	try {
		await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' })
	} finally {
		await session.detach()
	}
})

/**
 * How the first match of a selector displays in a fixture page opened with
 * scripting off, or false where turning it off doesn't match `(scripting:
 * none)`, which it only does in Chromium.
 */
const displayWithoutScripts = defineBrowserCommand<[path: string, selector: string]>(
	async (context, path, selector) => {
		const browser = context.page.context().browser()
		if (browser?.browserType().name() !== 'chromium') {
			return false
		}

		const frame = await context.frame()
		const withoutScripts = await browser.newContext({ javaScriptEnabled: false })
		try {
			const page = await withoutScripts.newPage()
			await page.goto(new URL(`${path}index.html`, frame.url()).href)
			return await page
				.locator(selector)
				.first()
				.evaluate((element) => getComputedStyle(element).display)
		} finally {
			await withoutScripts.close()
		}
	},
)

export default defineConfig(async (): Promise<ViteUserConfig> => {
	// Built before any server starts: Vite lists the public directory once, on
	// start, so the browser project serves the fixture's pages and assets from
	// its first request. Unit tests rebuild dist while browser tests run, so
	// serve a separate build.
	const { dist } = await buildFixture('core-image', '.vitest/dist')
	// The fixture with its own icons, served from a folder of the same directory
	await buildFixture('theme', '../core-image/.vitest/dist/themed')
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
					plugins: [
						{
							// An explicit cache policy, so that no test depends on how long ago
							// the fixture was built. A URL with `must-revalidate` in it gets what
							// a host gives images it doesn't fingerprint, on a slow connection.
							configureServer(server) {
								server.middlewares.use((request, response, next) => {
									const url = request.url ?? ''
									if (url.includes('cold-image')) {
										response.setHeader('Cache-Control', 'no-store')
										setTimeout(() => {
											if (url.includes('failed-image')) {
												response.statusCode = 404
												response.end()
											} else {
												next()
											}
										}, 1800)
										return
									}

									if (url.includes('must-revalidate')) {
										response.setHeader('Cache-Control', 'no-cache')
										setTimeout(next, 200)
										return
									}

									if (url.startsWith('/media/') || url.startsWith('/_astro/')) {
										response.setHeader('Cache-Control', 'max-age=3600')
									}

									next()
								})
							},
							name: 'media-cache-policy',
						},
					],
					publicDir: dist,
					test: {
						browser: {
							commands: {
								displayWithoutScripts,
								emulateReducedMotion,
								mouseDown,
								mouseFlick,
								mouseMove,
								mouseUp,
								mouseWheel,
								touchDown,
								touchMove,
								touchSwipe,
								touchUp,
							},
							enabled: true,
							headless: true,
							// WebKit's Windows build can't play the test media, and every test
							// that waits on it runs out its timeout. Safari doesn't run there.
							instances: [
								{ browser: 'chromium' },
								{ browser: 'firefox' },
								...(process.platform === 'win32' ? [] : [{ browser: 'webkit' as const }]),
							],
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
