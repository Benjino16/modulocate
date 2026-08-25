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
      globals: globals.browser,
    },
  },
  {
    // TanStack Router file-based routes always pair `export const Route =
    // createFileRoute(...)` (not a component) with the page component in
    // the same file — that's the intended structure, not something to fix
    // by splitting files. (allowExportNames doesn't cleanly cover this: once
    // Route is allowlisted, the rule stops treating the file as having a
    // component export at all and instead flags every local PascalCase
    // function in it, which is worse.) A full reload instead of a hot
    // update when a route file changes is an acceptable trade-off here.
    files: ['src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
