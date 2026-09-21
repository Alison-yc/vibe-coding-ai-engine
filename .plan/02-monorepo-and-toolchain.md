# 02 · Monorepo 结构与工具链

| 项       | 值              |
| -------- | --------------- |
| 阶段     | M0 · 工程底座   |
| 依赖     | 无              |
| 预计工期 | 2～3 天         |
| 状态     | 已完成（CR-01） |

## 目标

把当前“根配置已经预填，但共享包、脚本目录和 Web 壳尚未落地”的仓库，改造成一个结构完整、`pnpm ci:local` 一键自检的 monorepo。

**非目标**：这个阶段不写任何业务代码。功能一行都不加，只动结构和配置。

## 前置条件

- Node ≥ 24（本机 24.8.0 ✓），pnpm ≥ 11（本机 11.22.0 ✓）
- Rust toolchain（本机 1.97.1 ✓）
- 当前分支已提交干净，改造前打一个 tag 方便回滚

## 当前状态盘点（CR-01 开工前）

规划阶段已经提前填充了一批根配置。实施时必须**审查、复用并验证**，不要按旧计划盲目重写。

| 项                      | 当前状态                                                      | CR-01 要做什么                                                   |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| 根 `package.json`       | 已是 workspace 根，含 turbo/test/security/ci 脚本             | 核对 filter、依赖和脚本能否在真实子包上运行                      |
| `pnpm-workspace.yaml`   | 已含 `packages/* clients/* servers/* frontend/*`              | 保留；删除孤立 `frontend/package.json` 后验证包发现              |
| `frontend/package.json` | 孤立空壳，不被 `frontend/*` 匹配                              | 删除；只占位 `frontend/liangzui-ai-web/`，最小 Web 骨架属于 12-A |
| `packages/`             | 目录存在但为空                                                | 建 6 个共享包及最小 package/tsconfig/index                       |
| `scripts/`              | 不存在，但根脚本已引用其中路径                                | 建三个目录；真实脚本分别由 04/15/18 实现                         |
| 根格式与 lint 配置      | `.editorconfig`、Prettier、ESLint、commitlint 已填充          | 审查并验证；不要重写已正确的内容                                 |
| Turbo / TS / Vitest     | `turbo.json`、`tsconfig.base.json`、`vitest.config.ts` 已存在 | 接入真实子包后验证任务图与测试发现                               |
| Husky                   | hook 文件已存在                                               | 核对依赖、内容和可执行权限                                       |
| 服务端局部配置          | 仍有 `.prettierrc` 与 `eslint.config.mjs`                     | 收敛到根配置，避免双重规则                                       |
| CI / 安全 / Docker      | 骨架文件已经存在                                              | CR-01 只保证本地命令可用；16-A/17-A 在 CR-04 审查远端门禁        |

如果开工时仓库状态再次变化，先更新本表，再实施；不要让模型根据过时盘点覆盖已有成果。

## 技术选型

| 工具                | 版本                 | 为什么是它                                                                                         |
| ------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| pnpm workspace      | 11.x                 | 已在用。硬链接节省磁盘，`--filter` 精准操作子包                                                    |
| Turborepo           | 2.10.x               | 任务依赖编排 + 本地缓存。6 个包以上手写 pnpm 脚本会失控。远端缓存关闭（单人项目无意义）            |
| TypeScript          | 5.9.x                | 用 project references + 共享 base 配置                                                             |
| ESLint              | 9.x（**不用 10.x**） | flat config。选 9 的理由见下方「版本取舍」                                                         |
| Prettier            | 3.9.x                | 只管格式，规则冲突交给 `eslint-config-prettier` 关掉                                               |
| Husky + lint-staged | 9.x / 17.x           | 提交前只检查改动文件，秒级反馈                                                                     |
| commitlint          | 21.x                 | 强制提交信息格式                                                                                   |
| Vitest              | 4.1.x                | 根 `vitest.config.ts` 用 `test.projects` 统一编排（`vitest.workspace.ts` 在 3.2 已废弃、4.x 移除） |

### 版本取舍：为什么 ESLint 用 9 而不是最新的 10

npm 上 `eslint` 最新是 `10.9.0`，`typescript-eslint@8.67.0` 的 peer 范围写的是 `^8.57.0 || ^9.0.0 || ^10.0.0`，理论上兼容。但生态里大量插件（`eslint-plugin-import-x`、`eslint-plugin-react-hooks` 等）对 ESLint 10 的适配深度参差不齐，单人项目不值得花时间踩这个坑。

结论：起步用 `eslint@9.39.5`（这是 npm 上 `maintenance` tag 指向的版本，仍在维护），把升级 10 记为 `20-adr-and-risks.md` 里的一条待办。这是有意识的保守选择，不是疏忽。

## 实施步骤

### 步骤 1 · 清理与建骨架

```bash
# 1.1 删掉孤立的 frontend/package.json（它不在 workspace 内，是个误建）
rm frontend/package.json

# 1.2 建包目录
mkdir -p packages/{tsconfig,eslint-config,contracts,platform,ui,app-core}/src
mkdir -p frontend/liangzui-ai-web
mkdir -p docker/init
mkdir -p scripts/{model-baseline,gen-tests,rag-eval}
```

`frontend/liangzui-ai-web` 的 Vite + React 骨架在 `12` 阶段生成，这里只占位。

### 步骤 2 · 重写根 `package.json`

根文件已经预填。本步骤改为**逐项核对并修正**，只有不满足下列要求时才修改：

- `"private": true`，根包不发布
- `"type": "module"`，全仓库统一 ESM（现有子包已经是 module）
- `packageManager` 字段锁定 pnpm 版本，避免换机器行为不一致
- `engines` 声明 Node 版本
- 脚本全部走 turbo，只有 workspace 级操作（如 `format`）直接调工具

脚本清单：

| 脚本                                 | 作用                                                |
| ------------------------------------ | --------------------------------------------------- |
| `dev:server` / `dev:web` / `dev:app` | 分别起后端、Web 壳、Tauri 壳                        |
| `dev:db`                             | `docker compose -f docker/docker-compose.yml up -d` |
| `build`                              | turbo 编排全量构建                                  |
| `lint` / `lint:fix`                  | ESLint                                              |
| `format` / `format:check`            | Prettier                                            |
| `typecheck`                          | 各包 `tsc --noEmit`                                 |
| `test` / `test:cov`                  | Vitest                                              |
| `sec:sast` / `sec:sca`               | Semgrep / 依赖审计                                  |
| `ci:local`                           | 本地跑一遍 CI 的全部门禁                            |

`ci:local` 是这个阶段最重要的产出：一条命令复现 CI 的全部检查，避免"本地过了 CI 红"的来回折腾。

### 步骤 3 · 共享 TS 配置

`tsconfig.base.json`（根）已经存在，先核对下列关键项；本步骤主要创建 `packages/tsconfig` 预设并让各包接入：

| 选项                       | 值     | 理由                                                                                 |
| -------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `strict`                   | `true` | 不解释                                                                               |
| `noUncheckedIndexedAccess` | `true` | 数组下标访问返回 `T \| undefined`。刚开始会很烦，但它能挡住大量运行时 undefined 崩溃 |
| `noImplicitOverride`       | `true` | NestJS 继承场景下有用                                                                |
| `verbatimModuleSyntax`     | `true` | 强制 `import type`，避免运行时误引入                                                 |
| `isolatedModules`          | `true` | 与 bundler 行为一致                                                                  |
| `skipLibCheck`             | `true` | 第三方类型冲突不阻塞自己                                                             |

`packages/tsconfig` 提供三个预设：`base.json`（继承根）、`react.json`（加 DOM lib 与 jsx）、`node.json`（加 Node types，给 NestJS 与脚本用）。

各包 `tsconfig.json` 只写 `extends` + `paths` + `include`，不重复配置项。

### 步骤 4 · ESLint 共享配置

根 `eslint.config.js` 已有基础规则和架构护栏。本步骤创建 `packages/eslint-config` 四个预设，再把根配置收敛为按目录组合：

| 预设    | 覆盖         | 关键规则                                                                                           |
| ------- | ------------ | -------------------------------------------------------------------------------------------------- |
| `base`  | 全部 TS      | typescript-eslint recommended-type-checked、禁 `any`、禁非空断言、禁 floating promise、import 排序 |
| `react` | 前端包       | react-hooks 规则、禁 `export default`（组件文件除外）、a11y 基础                                   |
| `node`  | 服务端与脚本 | 禁 `console`（用 logger）、Node 内置模块用 `node:` 前缀                                            |
| `test`  | 测试文件     | 放宽 `any` 与非空断言，禁 `it.only` / `describe.skip` 进主干                                       |

同时把 `servers/liangzui-ai-server/eslint.config.mjs` 和 `servers/liangzui-ai-server/.prettierrc` 删除，收敛到根配置，避免两套规则打架。

**必须落地的自定义约束**（这些是防架构腐化的，不是风格偏好）：

```
1. packages/app-core 不允许 import @tauri-apps/*        → no-restricted-imports
2. packages/ui 不允许 import app-core / contracts        → no-restricted-imports
3. 全仓库不允许跨包相对路径穿透 ../../packages/*         → no-restricted-imports
4. 前端包不允许 import Node 内置模块                     → no-restricted-imports
```

这四条用 ESLint 的 `no-restricted-imports` 配 `zones` 实现。它们比任何文档都管用——文档会被忘记，lint 会报错。

### 步骤 5 · Prettier

根 `.prettierrc` 与 `.prettierignore` 已存在。核对：单引号、分号、行宽 100、trailing comma all、`endOfLine: lf`，并确认 `prettier-plugin-tailwindcss` 可处理 Tailwind v4。

不要为了让门禁变绿而扩大 ignore。既存源码的格式问题应在 CR-01 单独格式化并作为清晰提交，不和结构变更混在同一个提交。

### 步骤 6 · Turborepo

`turbo.json` 已存在。接入新包后验证任务依赖关系：

```
typecheck ─ 依赖 ─→ ^build（上游包先构建出 .d.ts）
build     ─ 依赖 ─→ ^build
test      ─ 依赖 ─→ ^build
lint      ─ 无依赖，可完全并行
```

`build` 的 `outputs` 要写全（`dist/**`），否则缓存失效。`dev` 任务标 `"cache": false, "persistent": true`。

环境变量放 `globalEnv`，否则改了 `.env` 缓存不失效会给出错误结果——这是 turbo 最常见的坑。

### 步骤 7 · Vitest 根配置

根 `vitest.config.ts` 已存在。本步骤与 `15-A` 合并实施：核对 `test.projects`、接入真实项目，并实测 NestJS 迁移。coverage 只能在根配置（Vitest 的限制）。

```
projects: ['packages/*', 'servers/*', 'frontend/*']
```

覆盖率 provider 用 `@vitest/coverage-v8`，reporter 输出 `text` + `html` + `lcov`（lcov 给 CI 用）+ `json-summary`（给门禁脚本读）。阈值配置见 `15`。

同时把 `servers/liangzui-ai-server` 从 Jest 迁到 Vitest：删除 `package.json` 里的 `jest` 配置块与 `jest`/`ts-jest`/`@types/jest` 依赖，`app.controller.spec.ts` 的 `describe/it/expect` 语法 Vitest 兼容，改动很小。理由是全仓库统一一个测试框架，覆盖率能合并统计。

### 步骤 8 · Git hooks

依赖与 hook 文件已经预填。核对版本、内容与可执行权限；缺失时才补装或重新初始化，不覆盖已有 hook。

- `pre-commit`：`lint-staged`（只处理暂存文件：ESLint --fix + Prettier --write；`.rs` 文件走 `rustfmt`）
- `commit-msg`：`commitlint --edit $1`

`commitlint.config.js` 的 type 与 scope 白名单要与 `.cursor/rules/90-git-and-commit.mdc` 保持一致。

**不在 pre-commit 里跑测试和 typecheck。** 那会让每次提交等 30 秒以上，最后你一定会开始用 `--no-verify`，规范就废了。测试留给 CI 和手动 `pnpm ci:local`。

### 步骤 9 · 环境变量与 gitignore

- 根 `.env.example` 已有 Ollama、Postgres、NestJS、前端和沙箱变量；核对端口是否与 01 一致。
- `.gitignore` 已有数据库数据、SARIF、覆盖率和生成测试规则；验证而非重复追加。
- 核对 `.cursorignore`：不能排除 `.plan/`，应排除 `docker/data/`。

## 目录产出

```
根/
├── package.json               已有，核对并修正
├── pnpm-workspace.yaml        已有，验证包发现
├── turbo.json                 已有，验证任务图
├── tsconfig.base.json         已有，接入子包
├── vitest.config.ts           已有，与 15-A 一起验证
├── eslint.config.js           已有，收敛为共享预设
├── .prettierrc                已有，验证
├── .prettierignore            已有，验证
├── .editorconfig              已有，验证
├── commitlint.config.js       已有，核对规则一致性
├── .lintstagedrc.json         已有，验证
├── .nvmrc                     已有，验证
├── .npmrc                     已有，验证
├── .env.example               已有，核对端口
├── .husky/{pre-commit,commit-msg}  已有，核对可执行权限
└── packages/
    ├── tsconfig/{base,react,node}.json
    └── eslint-config/src/{base,react,node,test}.js
```

## 验收标准（DoD）

- [x] `pnpm install` 在干净 clone 上无警告通过
- [x] `pnpm typecheck` 全绿
- [x] `pnpm lint` 全绿
- [x] `pnpm format:check` 全绿
- [x] `pnpm test` 能跑（此时只有示例测试）
- [x] `pnpm ci:local` 一条命令跑完全部门禁
- [x] 故意在 `packages/app-core` 写一行 `import { invoke } from '@tauri-apps/api/core'`，`pnpm lint` **必须报错**
- [x] 以 `update` 手动调用 commit-msg hook（不创建空提交），hook **必须拒绝**
- [x] `pnpm turbo build --dry=json` 输出的依赖图与步骤 6 描述一致
- [x] 第二次 `pnpm build` 命中 turbo 缓存（输出 `FULL TURBO`）

## 验证命令

```bash
# 环境
node -v && pnpm -v && rustc --version

# 安装与全量自检
pnpm install
pnpm ci:local

# 分项
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test

# turbo 依赖图与缓存
pnpm turbo build --dry=json
pnpm build && pnpm build          # 第二次应命中缓存

# 架构护栏是否生效（应当报错）
pnpm lint --filter @ai-engine/app-core

# hooks
git commit -m "update" --allow-empty          # 应被拒绝
git commit -m "chore(plan): 测试提交规范" --allow-empty   # 应通过
```

## 风险与备选

| 风险                                              | 处置                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `noUncheckedIndexedAccess` 打开后现有代码大量报错 | 先在新包开启，`servers` 与 `clients` 用 `// @ts-expect-error` 逐步清理，记一条 ADR 定清理期限                                                                            |
| 从 Jest 迁 Vitest 时 NestJS 的装饰器/元数据有问题 | Vitest 需要 `swc` 或 `esbuild` 保留 decorator metadata。用 `unplugin-swc` + `reflect-metadata` 解决。若卡住，允许 servers 暂留 Jest 并记 ADR，但覆盖率合并方案需另行设计 |
| ESLint type-checked 规则让 lint 变慢              | 用 `projectService: true`，并把 type-checked 规则只应用到 `src/**`，测试与配置文件用非 type-checked 预设                                                                 |
| turbo 缓存给出过期结果                            | 确认 `globalEnv` 与 `inputs` 配置完整；排查时用 `--force` 对比                                                                                                           |
