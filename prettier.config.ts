import type { PrettierConfig } from '@kitschpatrol/prettier-config'
import { prettierConfig } from '@kitschpatrol/prettier-config'
import * as prettierPluginAstro from '@kitschpatrol/prettier-plugin-astro'

function injectPrettierOverride(config: PrettierConfig) {
	for (const override of config.overrides ?? []) {
		if (override.options?.plugins?.includes('prettier-plugin-astro')) {
			// @ts-expect-error - Types
			override.options.plugins = [prettierPluginAstro]
		}
	}
	return config
}

export default injectPrettierOverride(prettierConfig())
