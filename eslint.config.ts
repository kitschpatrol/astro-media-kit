import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		astro: true,
		ignores: [
			// Remark-validate-links can't find Aphex files...
			'playground/**/*.mdx',
			'playground-starlight/**/*.mdx',
			// Astro code blocks in markdown aren't part of any tsconfig program
			'**/*.md/*.astro',
		],
		type: 'lib',
	},
	{
		// Unpublished workspace packages...
		files: ['playground/package.json', 'playground-starlight/package.json'],
		rules: {
			'json-package/require-keywords': 'off',
			'json-package/require-version': 'off',
			'json-package/valid-devDependencies': 'off',
			'json-package/valid-package-definition': 'off',
		},
	},
)
