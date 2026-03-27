import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		astro: {
			overrides: {
				// TODO remove after shared-config > 6.1.0
				'import/no-duplicates': ['error', { considerQueryString: true }],
			},
		},
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
		files: ['package.json'],
		rules: {
			// TODO remove once all packages point to NPM
			'json-package/valid-dependencies': 'off',
		},
	},
	{
		// Unpublished workspace packages...
		files: ['*/package.json'],
		rules: {
			'json-package/require-keywords': 'off',
			'json-package/require-version': 'off',
			'json-package/valid-devDependencies': 'off',
			'json-package/valid-package-definition': 'off',
		},
	},
)
