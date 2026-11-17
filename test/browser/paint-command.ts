import { defineBrowserCommand } from '@vitest/browser-playwright'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'

/** Capture compositor frames: ordinary screenshots miss a brief opaque paint. */
export const lightboxPaint = defineBrowserCommand(async (context) => {
	const browser = context.page.context().browser()
	if (browser?.browserType().name() !== 'chromium') {
		return false
	}

	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
	try {
		const frame = await context.frame()
		await page.goto(new URL('/zoom/index.html', frame.url()).href)
		await page.evaluate(() => {
			const image = document.querySelector<HTMLElement>('#first .amk-zoom')!
			const video = document.querySelector<HTMLElement>('#video .amk-zoom')!
			image.dataset.gallery = 'paint'
			image.dataset.level = 'fill'
			delete image.dataset.scope
			video.dataset.gallery = 'paint'
			const marker = document.createElement('div')
			marker.style.cssText =
				'position:fixed;top:0;left:0;width:100%;height:8px;background:repeating-linear-gradient(90deg,red 0 16px,blue 16px 32px)'
			marker.ariaHidden = 'true'
			document.body.prepend(marker)
		})
		const opener = page.locator('#first .amk-zoom').first()
		await opener.scrollIntoViewIfNeeded()
		const session = await page.context().newCDPSession(page)
		const images: Uint8Array[] = []
		session.on('Page.screencastFrame', (event) => {
			images.push(Buffer.from(event.data, 'base64'))
			void session.send('Page.screencastFrameAck', { sessionId: event.sessionId })
		})
		await session.send('Page.startScreencast', { everyNthFrame: 1, format: 'png' })
		await opener.click()
		await page.waitForFunction(
			() => document.querySelector('#video .amk-zoom[data-lifted]') !== null,
		)
		// Include paints after the neighbor has moved and its styles have settled.
		await page.waitForTimeout(200)
		await page.keyboard.press('Escape')
		await page.locator('dialog[open]').waitFor({ state: 'hidden' })
		await session.send('Page.stopScreencast')
		let opaque = 0
		for (const data of images) {
			const { width } = await sharp(data).metadata()
			const scale = width / 1280
			const crop = await sharp(data)
				.extract({
					height: Math.round(4 * scale),
					left: Math.round(100 * scale),
					top: Math.round(2 * scale),
					width: Math.round(256 * scale),
				})
				.png()
				.toBuffer()
			const statistics = await sharp(crop).stats()
			const red = statistics.channels[0]!
			if (red.max - red.min < 2) {
				opaque++
			}
		}

		return { frames: images.length, opaque }
	} finally {
		await page.close()
	}
})
