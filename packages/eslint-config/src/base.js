import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sourceFiles = ['**/src/**/*.{ts,tsx,mts,cts}'];
const testFiles = [
  '**/*.{test,spec}.{js,ts,tsx}',
  '**/__tests__/**/*.{js,ts,tsx}',
  '**/test/**/*.{ts,tsx}',
];

const typedRecommended = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: sourceFiles,
  ignores: testFiles,
}));

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-ssr/**',
      '**/build/**',
      '**/coverage/**',
      '**/target/**',
      '**/gen/**',
      '**/.turbo/**',
      '**/drizzle/**',
      '**/*.generated.*',
      'pnpm-lock.yaml',
      'tests/semgrep/**',
    ],
  },
  js.configs.recommended,
  ...typedRecommended,
  {
    files: sourceFiles,
    ignores: testFiles,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.es2023 },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  prettierConfig,
];
