import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * 根 ESLint 配置（flat config）。
 *
 * 组织方式：全局忽略 → 通用基线 → 按目录分层覆盖 → 架构护栏 → Prettier 兜底。
 *
 * 其中「架构护栏」段落是防架构腐化的核心，不是风格偏好。
 * 详见 .plan/02-monorepo-and-toolchain.md 步骤 4 与 .plan/12-dual-shell-web-and-desktop.md。
 *
 * 当包数量增多、配置变长后，把各段抽到 packages/eslint-config 下按预设导出。
 */
export default tseslint.config(
  // ── 全局忽略 ────────────────────────────────────────────────
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
    ],
  },

  // ── 通用基线 ────────────────────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.es2023 },
    },
    rules: {
      // 类型安全：any 与非空断言是最常见的类型逃逸手段
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
      ],

      // 错误处理：吞掉异常会把"Ollama 没启动"伪装成"模型能力不行"
      'no-empty': ['error', { allowEmptyCatch: false }],

      // 一致性
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'no-console': 'warn',
    },
  },

  // ── 服务端与脚本（Node 环境） ────────────────────────────────
  {
    files: ['servers/**/*.ts', 'scripts/**/*.ts', '*.config.{ts,js}', '**/*.config.{ts,js}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Node 内置模块必须带 node: 前缀，与 npm 包区分开
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'fs', message: '用 node:fs' },
            { name: 'path', message: '用 node:path' },
            { name: 'child_process', message: '用 node:child_process' },
            { name: 'crypto', message: '用 node:crypto' },
            { name: 'os', message: '用 node:os' },
            { name: 'url', message: '用 node:url' },
          ],
        },
      ],
    },
  },

  // 服务端禁止 console 与直接读 process.env（见 .cursor/rules/30-nestjs-server.mdc）
  {
    files: ['servers/**/src/**/*.ts'],
    rules: {
      'no-console': 'error',
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

  // ── 前端（浏览器环境 + React） ───────────────────────────────
  {
    files: [
      'clients/**/src/**/*.{ts,tsx}',
      'frontend/**/src/**/*.{ts,tsx}',
      'packages/{ui,app-core,platform}/src/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // ══════════════════════════════════════════════════════════
  // 架构护栏 —— 以下四条是架构的生命线，不要放宽
  // 文档会被忘记，lint 不会。
  // ══════════════════════════════════════════════════════════

  // 护栏 1 & 2：app-core 必须保持端无关
  {
    files: ['packages/app-core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*', '@tauri-apps/**'],
              message: 'app-core 必须端无关。平台能力走 @ai-engine/platform 的接口。见 .plan/12。',
            },
            {
              group: ['node:*', 'fs', 'path', 'child_process', 'os'],
              message: 'app-core 运行在浏览器与 webview 中，不能使用 Node 内置模块。',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: '走 @ai-engine/platform 的 kv 接口，见 .plan/12。' },
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

  // 护栏 3：ui 包只做展示，不依赖业务与契约
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@ai-engine/app-core', '@ai-engine/contracts', '@ai-engine/platform'],
              message: 'ui 包只做无状态展示，不依赖业务、契约或平台层。业务语义组件放 app-core。',
            },
          ],
        },
      ],
    },
  },

  // 护栏 4：contracts 包保持零运行时依赖（只允许 zod）
  {
    files: ['packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', '@nestjs/*', 'express', '@ai-engine/*'],
              message: 'contracts 是纯类型契约层，只允许依赖 zod。见 .plan/03。',
            },
          ],
        },
      ],
    },
  },

  // 护栏（补充）：禁止跨包相对路径穿透
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['*.config.{ts,js}', '**/*.config.{ts,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/../../packages/**', '**/../../../packages/**', '**/../../../../**'],
              message: '跨包引用必须用包名（@ai-engine/xxx），不能用相对路径穿透。',
            },
          ],
        },
      ],
    },
  },

  // ── 测试文件：放宽类型严格度，但禁止 only/skip 进主干 ──────────
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-globals': 'off',
      // it.only / describe.skip 混进主干会让整个套件静默失效
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[object.name=/^(it|test|describe)$/][property.name=/^(only|skip)$/]',
          message: '不要把 .only / .skip 提交到主干。',
        },
      ],
    },
  },

  // ── Prettier 兜底（必须放最后，关掉所有与格式冲突的规则） ──────
  prettierConfig,
);
