import globals from 'globals';
import { createCrossPackageImportGroups } from './cross-package.js';

const nodeBuiltinPaths = [
  { name: 'child_process', message: '用 node:child_process' },
  { name: 'crypto', message: '用 node:crypto' },
  { name: 'fs', message: '用 node:fs' },
  { name: 'os', message: '用 node:os' },
  { name: 'path', message: '用 node:path' },
  { name: 'url', message: '用 node:url' },
];

export default [
  {
    files: ['servers/**/*.ts', 'scripts/**/*.ts', '*.config.{ts,js}', '**/*.config.{ts,js}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeBuiltinPaths,
          patterns: createCrossPackageImportGroups(),
        },
      ],
    },
  },
  {
    files: ['servers/**/src/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: ['servers/**/src/**/*.ts'],
    ignores: ['servers/**/src/config/**', 'servers/**/src/main.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: '配置统一从 ConfigService 读取，不要直接访问 process.env',
        },
      ],
    },
  },
];
