import type { Frame } from 'playwright'
import { defineBrowserCommand, playwright } from '@vitest/browser-playwright'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

/**
 * The built Astro fixture, served at the root so its pages and assets load in
 * the browser tests.
 */
const fixtureDistribution = fileURLToPath(
	new URL('test/parity/fixtures/core-image/dist/', import.meta.url),
)

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

export default defineConfig({
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
				publicDir: fixtureDistribution,
				test: {
					browser: {
						commands: {
							emulateReducedMotion,
							mouseDown,
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
					// Native input tests must not compete for browser focus across files.
					fileParallelism: false,
					// The page tests load the fixture's built HTML and assets.
					globalSetup: ['test/browser/setup.ts'],
					include: ['test/**/*.browser.test.ts'],
					name: 'browser',
				},
			},
		],
	},
})
