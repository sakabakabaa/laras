import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import unicodeEscapePlugin from './eslint.unicode-escapes-plugin.mjs';

export default tseslint.config(
	{
		ignores: [
			'node_modules/**',
			'dist/**',
			'build/**',
			'.react-router/**',
			'src/components/ui/**',
			'src/hooks/use-toast.ts',
			'vite.config.ts',
			'react-router.config.ts',
		],
	},
	{
		files: ['**/*.{ts,tsx}'],
		extends: [tseslint.configs.recommended],
		plugins: { react, 'react-hooks': reactHooks, import: importPlugin },
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			parserOptions: { ecmaFeatures: { jsx: true } },
			globals: { ...globals.browser, React: 'readonly', Intl: 'readonly' },
		},
		settings: {
			react: { version: 'detect' },
			'import/extensions': ['.ts', '.tsx'],
			'import/resolver': {
				node: { extensions: ['.ts', '.tsx'] },
				alias: { map: [['@', './src']], extensions: ['.ts', '.tsx'] },
			},
		},
		rules: {
			...react.configs.recommended.rules,
			...reactHooks.configs.recommended.rules,
			'react/prop-types': 'off',
			'react/no-unescaped-entities': 'off',
			'react/display-name': 'off',
			'react/jsx-uses-react': 'off',
			'react/react-in-jsx-scope': 'off',
			'react/jsx-uses-vars': 'off',
			'react/jsx-no-comment-textnodes': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'import/no-named-as-default': 'off',
			'import/no-named-as-default-member': 'off',
			'import/no-unresolved': 'off',
			'import/no-self-import': 'error',
			'import/no-cycle': ['error', { ignoreExternal: true }],
			'no-undef': 'off',
		},
	},
	{
		files: ['**/*.tsx'],
		plugins: { horizons: unicodeEscapePlugin },
		rules: { 'horizons/no-unicode-escapes-in-jsx': 'warn' },
	},
	{
		files: ['src/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: `CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]:matches([arguments.length<2], [arguments.0.type='Identifier'][arguments.0.name='undefined'], [arguments.0.value='default'])`,
					message: 'toLocaleDateString/toLocaleTimeString without an explicit locale (not undefined or \'default\') and options renders differently on the server (UTC, fixed locale) and in the visitor\'s browser, causing a hydration mismatch. For server-rendered output pass a locale AND timeZone, e.g. date.toLocaleDateString(\'en-US\', { timeZone: \'UTC\', dateStyle: \'medium\' }). In client-only code (effects, event handlers) that should use the visitor\'s zone, still pass a locale and options — just omit timeZone, e.g. date.toLocaleDateString(\'en-CA\', { year: \'numeric\', month: \'2-digit\', day: \'2-digit\' }). See vault skill react-router-framework-mode/references/hydration.md.',
				},
				{
					selector: `CallExpression[callee.property.name='toLocaleString']:matches([arguments.length=0], [arguments.0.type='Identifier'][arguments.0.name='undefined'], [arguments.0.value='default'])`,
					message: 'toLocaleString without an explicit locale (not undefined or \'default\') depends on the runtime locale and timezone, which differ between the server (UTC) and the visitor\'s browser and cause a hydration mismatch. Pass an explicit locale — and a timeZone when formatting server-rendered dates. See vault skill react-router-framework-mode/references/hydration.md.',
				},
			],
		},
	},
	{
		files: ['tools/**/*.{js,ts}', 'tailwind.config.js'],
		languageOptions: { globals: globals.node },
	},
);
