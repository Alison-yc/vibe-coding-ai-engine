import baseConfig from '@ai-engine/eslint-config/base';
import { createRestrictedImportRule } from '@ai-engine/eslint-config/cross-package';
import nodeConfig from '@ai-engine/eslint-config/node';
import reactConfig from '@ai-engine/eslint-config/react';
import testConfig from '@ai-engine/eslint-config/test';

const configFileIgnores = ['*.config.{ts,js}', '**/*.config.{ts,js}'];

export default [
  ...baseConfig,
  ...nodeConfig,
  ...reactConfig,
  {
    files: ['packages/**/*.{ts,tsx}'],
    ignores: configFileIgnores,
    rules: {
      'no-restricted-imports': createRestrictedImportRule(),
    },
  },
  {
    files: ['packages/app-core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': createRestrictedImportRule([
        {
          group: ['@tauri-apps/*', '@tauri-apps/**'],
          message: 'app-core 必须端无关。平台能力走 @ai-engine/platform 的接口。',
        },
        {
          group: ['@ai-engine/platform/web', '@ai-engine/platform/tauri'],
          message: 'app-core 只依赖 platform 接口，由壳注入实现。',
        },
      ]),
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: '走 @ai-engine/platform 的 kv 接口。' },
        { name: 'sessionStorage', message: '走 @ai-engine/platform 的 kv 接口。' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: '__TAURI__', message: 'app-core 不得探测宿主环境。' },
        {
          object: 'window',
          property: '__TAURI_INTERNALS__',
          message: 'app-core 不得探测宿主环境。',
        },
      ],
    },
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': createRestrictedImportRule([
        {
          group: ['@ai-engine/app-core', '@ai-engine/contracts', '@ai-engine/platform'],
          message: 'ui 包只做无状态展示，不依赖业务、契约或平台层。',
        },
        {
          group: ['node:*', 'fs', 'path', 'child_process', 'crypto', 'os'],
          message: 'ui 包运行在浏览器中，不能导入 Node 内置模块。',
        },
      ]),
    },
  },
  {
    files: ['packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': createRestrictedImportRule([
        {
          group: ['react', 'react-*', '@nestjs/*', 'express', '@ai-engine/*'],
          message: 'contracts 是纯类型契约层，只允许依赖 zod。',
        },
      ]),
    },
  },
  {
    files: ['clients/**/src/**/*.{ts,tsx}', 'frontend/**/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': createRestrictedImportRule([
        {
          group: ['node:*', 'fs', 'path', 'child_process', 'crypto', 'os'],
          message: '浏览器代码不能导入 Node 内置模块。',
        },
      ]),
    },
  },
  ...testConfig,
];
