import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Public Python/Pyodide bundles are runtime assets, not source modules.
  // Linting their generated code produces thousands of unreachable-code and
  // browser-global findings that obscure actionable frontend errors.
  globalIgnores(['dist', 'public/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-refresh/only-export-components': 'off',
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        caughtErrors: 'none',
      }],
    },
  },
])
