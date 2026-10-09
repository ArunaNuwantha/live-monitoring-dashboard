import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/** Clean-architecture dependency rule: inner layers never import outer ones. */
const layer = (files, forbidden, message) => ({
  files,
  ignores: ['**/*.test.ts', '**/*.test.tsx'],
  rules: {
    'no-restricted-imports': ['error', { patterns: forbidden.map((group) => ({ group: [group], message })) }],
  },
})

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
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Never render HTML from data. Use text.' },
        { selector: "MemberExpression[property.name='innerHTML']", message: 'Never write innerHTML. Use textContent.' },
      ],
    },
  },
  layer(['src/domain/**'], ['react', 'react-dom', '**/application/**', '**/infrastructure/**', '**/presentation/**'], 'domain must stay pure: no framework or outer-layer imports.'),
  layer(['src/application/**'], ['react', 'react-dom', '**/infrastructure/**', '**/presentation/**'], 'application depends only on domain and its own ports.'),
  layer(['src/infrastructure/**'], ['react', 'react-dom', '**/presentation/**'], 'infrastructure must not depend on the UI.'),
])
