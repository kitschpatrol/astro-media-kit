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
		ts: {
			overrides: {
				'depend/ban-dependencies': [
					'error',
					{
						allowed: ['lodash'],
					},
				],
			},
		},
		type: 'lib',
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
