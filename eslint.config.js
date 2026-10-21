import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

/**
 * The lint rules of the site.
 *
 * The rules are deliberately few: they catch the mistakes that break a build
 * (a floating promise, an unused variable, a wrong type) and stay out of the
 * way of the formatting, which Prettier takes care of.
 */
export default defineConfig(
  globalIgnores([
    'dist/**',
    '.astro/**',
    '.wrangler/**',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,

  // The Astro files and the TypeScript of the site.
  astro.configs.recommended,

  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  {
    files: ['**/*.{ts,mts,astro}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },

  // The migration scripts talk to the console on purpose.
  {
    files: ['scripts/**/*.mts'],
    rules: {
      'no-console': 'off',
    },
  },

  // The tests assert on the shape of things, so the casts are expected.
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Astro generates `src/env.d.ts` with a triple-slash reference.
  {
    files: ['src/env.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
);
