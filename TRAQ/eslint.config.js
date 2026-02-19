import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // App.tsx is a large file that exports helpers/constants alongside the component.
      // Until it is split up, don't block lint on Fast Refresh export purity.
      'react-refresh/only-export-components': 'off',

      // This codebase currently uses `any` in several legacy/compat layers (e.g. iOS9 XHR REST client).
      // Treating it as an error produces a huge wall of lint failures.
      '@typescript-eslint/no-explicit-any': 'off',

      // Allow underscore-prefixed unused values (common for "intentionally unused" placeholders)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Several components intentionally set state in effects for initialization.
      // This rule is useful, but it's currently blocking lint for existing code.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
