import { defineConfig } from 'vitest/config';

/**
 * 给 gen-tests:verify / mutate 用的独立配置。
 * 不能走 workspace project：默认套件会排除 fixture 与 .generated 草稿，
 * 显式传入这些文件时也会变成 No test files found。
 */
export default defineConfig({
  test: {
    name: 'gen-tests-verify',
    environment: 'node',
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', '**/*.generated.spec.ts'],
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    testTimeout: 30_000,
  },
});
