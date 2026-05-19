import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		fileParallelism: false,
		hookTimeout: 120_000,
		include: ['test/**/*.test.ts'],
		testTimeout: 60_000,
	},
})
