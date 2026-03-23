import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		astro: true,
		ignores: [
			// Directives and attributes make a mess of MDX linting
			'playground/**/*.mdx',
			'playground-starlight/**/*.mdx',
			'references/**/*',
		],
		type: 'lib',
	},
	{
		files: ['src/components/*.astro.d.ts'],
		rules: {
			'ts/naming-convention': 'off',
			'unicorn/filename-case': 'off',
		},
	},
	{
		files: ['playground/package.json', 'playground-starlight/package.json'],
		rules: {
			'json-package/require-keywords': 'off',
			'json-package/require-version': 'off',
			'json-package/valid-devDependencies': 'off',
			'json-package/valid-package-definition': 'off',
		},
	},
)
