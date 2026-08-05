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
		// Astro types JSX as `Element = HTMLElement | any` (astro-jsx.d.ts), so any
		// callback returning template JSX (e.g. `items.map(() => <li />)`) is `any`
		files: ['**/*.astro'],
		rules: {
			'ts/no-unsafe-return': 'off',
		},
	},
	{
		// Linkedom doesn't implement `Element.getHTML()`, so the auto-fix to
		// replace `innerHTML` breaks at runtime
		rules: {
			'unicorn/prefer-dom-node-html-methods': 'off',
		},
	},
	{
		files: ['test/parity/**/*.ts', 'test/parity/**/*.astro'],
		rules: {
			'astro/jsx-a11y/html-has-lang': 'off',
			'e18e/prefer-static-regex': 'off',
			'test/expect-expect': [
				'error',
				{ assertFunctionNames: ['expect', 'compareImg', 'comparePicture'] },
			],
		},
	},
	{
		// Unpublished workspace packages...
		files: [
			'playground/package.json',
			'playground-starlight/package.json',
			'test/parity/fixtures/core-image/package.json',
			'test/parity/fixtures/picture-darkmode/package.json',
		],
		rules: {
			'json-package/require-keywords': 'off',
			'json-package/require-version': 'off',
			'json-package/valid-devDependencies': 'off',
			'json-package/valid-package-definition': 'off',
		},
	},
)
