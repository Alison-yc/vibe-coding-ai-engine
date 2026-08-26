import { defineConfig } from 'vitest/config';

/**
 * 根 Vitest 配置。
 *
 * 注意：Vitest 3.2 起 `vitest.workspace.ts` 已废弃，4.x 移除，改用 `test.projects`。
 * coverage / reporters 只能在根配置声明，project 级配置不支持（Vitest 的限制）。
 *
 * 阈值分级的理由见 .plan/15-testing-and-llm-testgen.md：
 * 一刀切的阈值会导致 UI 壳达不到、核心逻辑又没保障。
 */
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'servers/*/vitest.config.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      all: true,
      include: ['packages/*/src/**/*.{ts,tsx}', 'servers/*/src/**/*.{ts,tsx}'],

      exclude: [
        // 只排除没有可测逻辑的文件。不允许为了达标排除业务代码。
        '**/*.d.ts',
        '**/index.ts', // 纯 re-export
        '**/*.config.{ts,js}',
        '**/__tests__/**',
        '**/test/**',
        '**/*.{test,spec}.{ts,tsx}',
        '**/*.generated.*',
        '**/drizzle/**',
        '**/main.tsx', // 挂载入口
        '**/main.ts', // NestJS 进程入口
        '**/vite-env.d.ts',
      ],

      thresholds: {
        // 全局兜底
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75,

        // 纯函数与 schema，没有理由不覆盖
        'packages/contracts/**': {
          lines: 95,
          functions: 95,
          branches: 90,
          statements: 95,
        },
        // 微内核是架构核心，出 bug 影响面最大
        'servers/*/src/workflow/**': {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90,
        },
        // 安全相关，分支必须全覆盖
        'servers/*/src/agent/**': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        // 阶段多、边界情况多
        'servers/*/src/knowledge/**': {
          lines: 85,
          functions: 85,
          branches: 80,
          statements: 85,
        },
        // React 组件测试成本高，收益递减
        'packages/app-core/**': {
          lines: 70,
          functions: 70,
          branches: 65,
          statements: 70,
        },
        'packages/ui/**': {
          lines: 70,
          functions: 70,
          branches: 65,
          statements: 70,
        },
        // 装配代码，E2E 覆盖更有效
        'clients/**': {
          lines: 50,
          functions: 50,
          branches: 45,
          statements: 50,
        },
        'frontend/**': {
          lines: 50,
          functions: 50,
          branches: 45,
          statements: 50,
        },
      },
    },
  },
});
