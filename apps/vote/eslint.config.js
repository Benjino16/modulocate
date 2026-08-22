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
    // TanStack Router's file-based routes define their page component
    // locally and only ever export `Route` (the component itself is handed
    // to the router via `component: PageFn`, never exported directly) — the
    // rule has no way to recognize that convention (allowExportNames only
    // covers *exported* non-component names, and this component isn't
    // exported at all), so it flags every single route file for something
    // that isn't a real Fast Refresh problem in this codebase. Turned off
    // here rather than tuned, since there's no option that fits the shape of
    // this pattern.
    files: ['src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
