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
		// Applies to all TypeScript files because typescript-eslint creates a single shared
		// project service from the first file parsed, so a per-file override is ignored in
		// multi-file runs. The Astro config is excluded from tsconfig.json because Starlight 0.40
		// ships TypeScript source that fails type checking when imported.
		// See https://github.com/withastro/starlight/issues/3950
		files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
		// Markdown code blocks are virtual files with type-aware linting disabled
		ignores: ['**/*.md/**'],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ['playground-starlight/astro.config.ts'],
				},
			},
		},
	},
	{
		files: ['test/parity/**/*.ts', 'test/parity/**/*.astro'],
		rules: {
			'astro/jsx-a11y/html-has-lang': 'off',
			'e18e/prefer-static-regex': 'off',
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
