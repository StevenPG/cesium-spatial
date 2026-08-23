import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', 'docs-dist/**', 'apps/demo/public/api/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Formatting is Prettier's job; this turns off every rule that would fight it.
  prettier,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Config files, build scripts and the browser-test harness all run in Node.
    files: ['*.config.mjs', '*.config.ts', 'vitest.config.ts', 'scripts/**/*.mjs', 'e2e/**/*.ts'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' },
    },
  },
  {
    // The demo reaches for a couple of globals the libraries never touch.
    files: ['apps/demo/**/*.ts'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', CESIUM_BASE_URL: 'readonly' },
    },
  },
);
