# 01 · 整体架构

| 项   | 值     |
| ---- | ------ |
| 阶段 | 前置   |
| 依赖 | 00     |
| 状态 | 已完成 |

> 本 plan **冻结分层与数据流，不创建 `packages/*`、不改建 Web 壳**。把仓库改造成目标目录属于 `02`。若实施时改了分层决策，先在 `20` 追加 ADR，再改本文件。

## 分层总图

```
┌──────────────────────────────────────────────────────────────┐
│  壳层（薄，只做装配）                                          │
│  clients/liangzui-ai-app        frontend/liangzui-ai-web      │
│  Tauri v2 + Rust                浏览器                        │
│         └──────────┬───────────────────┘                      │
│            注入 platform 实现                                  │
├──────────────────────────────────────────────────────────────┤
│  packages/app-core   业务功能（端无关）                        │
│    features/chat  features/workflow  features/knowledge       │
│    chat 内按请求装配 agent 工具能力   stores/  hooks/          │
├──────────────────────────────────────────────────────────────┤
│  packages/ui         shadcn 组件 + 主题令牌                    │
│  packages/platform   平台能力接口（fs 对话框/本地KV/HTTP 基址） │
│  packages/contracts  zod schema + 类型（前后端共享）            │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP + SSE（契约来自 contracts）
┌───────────────────────────┴──────────────────────────────────┐
│  servers/liangzui-ai-server （NestJS）                        │
│                                                              │
│  ┌────────────┬────────────┬────────────┬─────────────────┐  │
│  │ chat       │ knowledge  │ workflow   │ agent           │  │
│  │ 会话/流式  │ 索引/检索  │ 图执行引擎 │ 循环/工具/权限   │  │
│  └─────┬──────┴─────┬──────┴─────┬──────┴────────┬────────┘  │
│        └────────────┴────────────┴───────────────┘           │
│                    共享基础设施层                              │
│   llm-gateway   vector-store   database(Drizzle)   events     │
└──────────┬──────────────────────────┬────────────────────────┘
           │                          │
    ┌──────┴───────┐          ┌───────┴────────────┐
    │ Ollama :11434│          │ Postgres :5432     │
    │ qwen3.5:2b   │          │ + pgvector         │
    │ gemma4:e2b   │          │ (Docker)           │
    │ nomic-embed  │          └────────────────────┘
    └──────────────┘
```

## 为什么这样分

**壳薄、业务厚。** 你选了「一套代码两个端」。如果业务代码写在 Tauri 应用里，Web 端就得复制一份，两边立刻开始漂移。所以业务全部下沉到 `packages/app-core`，壳只负责三件事：挂路由、注入 platform 实现、包一层全局 Provider。

**平台差异靠接口隔离，不靠条件判断。** 业务代码里不允许出现 `if (isTauri)`。差异收敛到 `packages/platform` 的接口，两个壳各注入一套实现：

| 能力           | Web 实现             | Tauri 实现           |
| -------------- | -------------------- | -------------------- |
| 选择工作区目录 | 提示用户手动输入路径 | 原生目录选择对话框   |
| 本地键值存储   | `localStorage`       | Rust 侧 SQLite       |
| 后端基址       | 同源 / 环境变量      | 从设置页读取，可配置 |
| 打开外部链接   | `window.open`        | `plugin-opener`      |

**契约层是前后端唯一的类型来源。** 所有跨进程数据结构（HTTP 请求响应、SSE 事件、工作流图 DSL、消息 part、工具 schema）都定义在 `packages/contracts` 的 zod schema 里。前端 import 类型，后端 import 同一份 schema 做运行时校验。这解决了全栈项目最常见的腐化点：接口改了前端不知道。

**Agent 的文件操作在服务端，不在 Rust 层。** 详细理由见 `10`。核心是工具执行必须与 LLM 循环同进程，否则每次 tool call 都要跨 IPC，且要维护 Rust 与 TS 两套工具实现。

**对话是唯一助手入口。** `/chat` 的普通问答保留真流式与 RAG；命中实用工具意图或本轮显式开启 `fileAccess` 时，由服务端复用 Agent 工具循环。文件能力是请求级权限，不是第二种会话或第二个产品页面；详情见 ADR-014。

## 架构不变量（后续 plan 不得违反）

这些是分层的生命线。ESLint 护栏已写在根 `eslint.config.js`；包目录由 `02` 创建后，护栏才会扫到真实代码。

| #   | 不变量                                                                          | 护栏                                                     |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | `app-core` 不出现 `@tauri-apps/*`、`window.__TAURI__`、`localStorage`、`node:*` | ESLint `no-restricted-imports` / `no-restricted-globals` |
| 2   | `ui` 不依赖 `app-core` / `contracts` / `platform`，不发请求                     | 同上                                                     |
| 3   | `contracts` 只允许依赖 `zod`，无副作用                                          | 同上                                                     |
| 4   | 跨包引用只用 `@ai-engine/*`，禁止 `../../../packages/xxx`                       | 同上                                                     |
| 5   | 壳层不写业务页面、不调 LLM                                                      | 代码评审 + `00-project-context` 目录地图                 |
| 6   | 服务端不直接拼 SQL、不直接 `process.env`（`config/` 与 `main.ts` 除外）         | Semgrep + ESLint                                         |
| 7   | 端口按本文件表格写死，改端口必须同步 `.env.example` 与 `00-project-context`     | 文档三处对照                                             |

发现自己想加 `eslint-disable` 绕过 1～4：**改设计，不关护栏。**

## 数据流示例：知识库问答的一次完整请求

```
用户在对话框输入问题
  │
  ├─ app-core/features/chat 调用 contracts 定义的 POST /chat/stream
  │
  ▼
NestJS ChatController
  ├─ ZodValidationPipe 校验入参
  ├─ 落库：写入 user message（先落库再执行，崩溃不丢消息）
  ▼
ChatService
  ├─ 1. 向量化问题        → LlmGateway.embed()      → Ollama nomic-embed
  ├─ 2. 检索相关片段      → VectorStore.search()    → pgvector <=> 余弦距离
  ├─ 3. 重排与截断        → 控制进入上下文的 token 量（2B 模型上下文紧张）
  ├─ 4. 组装提示词        → 系统提示 + 参考资料（标注为不可信数据）+ 历史 + 问题
  ├─ 5. 流式调用          → LlmGateway.stream()     → Ollama qwen3.5:2b
  ▼
逐 chunk 发 SSE 事件
  ├─ message.part.delta   （文本增量）
  ├─ message.citations    （引用来源）
  └─ done                 （终止信号，必须发）
  ▼
前端 event reducer 按 partId 增量更新 zustand store
  └─ 组件按 part 粒度订阅渲染，不整树重渲染
```

工具轮次从同一 `POST /chat/sessions/:id/stream` 进入：日期、计算、UUID、实时天气按输入确定性路由；文件工具还要求 `fileAccess=true` 与合法工作区。首批工具轮次与知识库检索互斥，避免未经基线验证的 2B 组合能力。

## 端口与进程

| 进程                  | 端口  | 启动方式                          |
| --------------------- | ----- | --------------------------------- |
| Ollama                | 11434 | 系统服务，已在本机运行            |
| PostgreSQL + pgvector | 5432  | `docker compose up -d`            |
| NestJS                | 3000  | `pnpm dev:server`                 |
| Vite（Web 壳）        | 5173  | `pnpm dev:web`                    |
| Vite（Tauri 壳）      | 1420  | `pnpm dev:app`（已配 strictPort） |

以上五处与 `.env.example`、`.cursor/rules/00-project-context.mdc` 必须一致。不要为了「先跑起来」临时改其中一个。

## 目标目录结构

`02` 负责把当前仓库改造成这个形态。本 plan 只冻结目标态，**不执行 mkdir / rm。**

```
AI-Engine/
├── .cursor/rules/                    # AI 协作规则（已完成）
├── .plan/                            # 开发计划（本目录）
├── .github/workflows/                # CI
├── docker/
│   ├── docker-compose.yml            # Postgres + pgvector
│   └── init/01-extensions.sql        # CREATE EXTENSION vector
├── scripts/
│   ├── model-baseline/               # 模型能力基线测评（plan 04）
│   ├── gen-tests/                    # LLM 生成测试用例（plan 15）
│   └── rag-eval/                     # RAG 效果评测（plan 18）
├── packages/
│   ├── tsconfig/                     # 共享 TS 配置
│   ├── eslint-config/                # 共享 ESLint 配置
│   ├── contracts/                    # ★ zod schema + 类型（唯一契约源）
│   ├── platform/                     # 平台能力接口 + web/tauri 实现
│   ├── ui/                           # shadcn 组件 + 主题令牌
│   └── app-core/                     # ★ 业务功能（端无关）
├── clients/
│   └── liangzui-ai-app/              # Tauri 桌面壳
├── frontend/
│   └── liangzui-ai-web/              # 浏览器 Web 壳
└── servers/
    └── liangzui-ai-server/           # NestJS
```

## 现有代码的处置

规划阶段后半已经填了一批配置，本表以**当前工作区实态**为准，避免 `02` 再把已写好的根配置当 0 字节空文件重写。动手前用下方「验证命令」重新确认一遍，不要照抄本表的过时结论。

| 现状                                                                                                                   | 处置                                                   | 在哪个 plan                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `frontend/package.json`（孤立空壳，未被 `frontend/*` glob 匹配）                                                       | 删除，改建 `frontend/liangzui-ai-web/`                 | 02                                                            |
| `packages/`（空，无子包）                                                                                              | 建 6 个子包                                            | 02 / 03                                                       |
| `scripts/`（**目录不存在**，但 `package.json` 的 `baseline` / `rag-eval` / `gen-tests` 已指向其中，现在跑必然 ENOENT） | 建 `model-baseline` / `gen-tests` / `rag-eval` 占位    | 02 建目录；04 / 15 / 18 写脚本                                |
| 根 `package.json`                                                                                                      | **已是 workspace 根**（scripts、turbo、ci:local 已在） | 02 剩余：子包 filter 能跑通、依赖安装                         |
| `.editorconfig` / `.prettierrc` / `eslint.config.js` / `commitlint.config.js`                                          | **已填充**；ESLint 四条架构护栏已在                    | 02 剩余：子包收敛自己的 eslint/prettier                       |
| `turbo.json` / `tsconfig.base.json` / `vitest.config.ts`                                                               | **已创建**                                             | 02 剩余：子包接入 project references 后 `pnpm typecheck` 全绿 |
| `.github/workflows/` + `dependabot.yml`                                                                                | **骨架已在**                                           | 17 负责跑通与分层完善                                         |
| `docker/docker-compose.yml` + `init/01-extensions.sql`                                                                 | **已创建**                                             | 05 负责本机跑通与 Drizzle                                     |
| `.semgrep.yml`（11 条自定义规则，已 `--validate` 通过）                                                                | 补 `tests/semgrep/` 自测用例                           | 16                                                            |
| `fundamentals/ollama.ts`（模块级单例、`numCtx` 2048、`numPredict` 128）                                                | 重构为 `LlmGateway`，参数按 04 实测值调整              | 04                                                            |
| `fundamentals/rag.ts`（`MemoryVectorStore`、硬编码 5 条中文知识）                                                      | 重构为 pgvector + 真实文档流水线                       | 05 / 06                                                       |
| `fundamentals/translate.ts`                                                                                            | 保留为 LLM 网关的第一个冒烟用例                        | 04                                                            |
| `app.controller.ts`（GET 传业务参数）                                                                                  | 改为 POST + DTO 校验                                   | 03                                                            |
| Tauri `commands.rs`（greet / say_hello 示例）                                                                          | 替换为真实的 platform 能力命令                         | 12                                                            |
| `clients/.../src/App.tsx`（官方示例页）                                                                                | 替换为路由 + Provider 装配                             | 12                                                            |
| `.husky/` 钩子可能缺可执行位                                                                                           | `chmod +x`                                             | 02                                                            |

## 关键设计决策速查

完整的决策记录（含被否决的方案）在 `20-adr-and-risks.md`。这里只列结论：

| 决策         | 结论                                                                |
| ------------ | ------------------------------------------------------------------- |
| 画布库       | `@xyflow/react` v12（Dify 用的 `reactflow` v11 是同一项目的旧包名） |
| 工作流执行   | LangGraph + 自建节点注册表                                          |
| 状态管理     | 服务端数据用 TanStack Query，交互态用 zustand slice                 |
| ORM          | Drizzle（对 pgvector 支持好，SQL 透明）                             |
| 向量库       | pgvector（Docker）                                                  |
| 对话 UI      | 自研 SSE + event reducer，不用 CopilotKit                           |
| 构建编排     | Turborepo                                                           |
| 测试         | Vitest 4 + Playwright                                               |
| 文件操作位置 | NestJS 服务端                                                       |

## 本 plan 要落地什么

| 做                                 | 不做                                            |
| ---------------------------------- | ----------------------------------------------- |
| 冻结分层、数据流、端口、不变量     | 不 `mkdir` 包目录、不删 `frontend/package.json` |
| 按仓库实态校准「现有代码处置」     | 不重写已填充的根配置                            |
| 确认 ESLint 护栏与不变量 1～4 对应 | 不改 Tauri 示例页（属 `12`）                    |
| 给出可自证的验证命令               | 不提前写 `LlmGateway` / RAG / 画布              |

## 实施步骤

### 步骤 1 · 对照仓库刷新处置表

已完成：上表按当前工作区校准。根配置、docker、CI 骨架、Semgrep 不再当成「不存在」。空的 `packages/` 与孤立 `frontend/package.json` 仍交给 `02`。

### 步骤 2 · 写入架构不变量

已写入本文件「架构不变量」表。根 `eslint.config.js` 已有护栏 1～4 与跨包相对路径禁令。包尚未创建，因此这些规则此时不会扫到业务文件，这是预期状态。

### 步骤 3 · 端口三处对照

`.plan/01` 本表、`.env.example`、`.cursor/rules/00-project-context.mdc`：Ollama 11434、NestJS 3000、Web 5173、Tauri 1420、Postgres 5432。不一致则改文档，不改「先跑起来再说」。

### 步骤 4 · 更新进度索引

`.plan/README.md` 前置表中 01 标为已完成。根 README 标明下一步是 `02`。

## 本 plan 验收标准

- [x] 分层总图与「为什么这样分」可指导 `02` 建包，且不与 `00` 冲突
- [x] 七条架构不变量已写出；其中 1～4 已有对应 ESLint 规则
- [x] 处置表与当前仓库一致（不再声称根 package.json 是 npm init 模板、配置文件是 0 字节）
- [x] 端口与 `.env.example`、`00-project-context.mdc` 一致
- [x] **未**执行 `02` 的 `mkdir` / `rm frontend/package.json`
- [x] 验证命令在「未完成」时会真的报错，而不是静默通过
- [x] `pnpm format:check` 对本 plan 改动的文件通过

## 验证命令（只读，不改变环境）

在仓库根目录逐条执行。每条在**状态不符**时都会明确报错，不会静默通过。

```bash
# 端口三处应都能搜到同一组数字
rg -n "11434|5432|3000|5173|1420" .plan/01-architecture-overview.md .env.example .cursor/rules/00-project-context.mdc

# 架构护栏应存在（包目录还没有，扫描 0 个 app-core 文件是正常的）
rg -n "no-restricted-imports" eslint.config.js

# 确认本 plan 没有提前建包。注意不能用 `ls packages || echo`：
# 目录存在但为空时 ls 退出码是 0，判断会永远通过。
[ -z "$(ls -A packages 2>/dev/null)" ] \
  && echo "OK: packages 仍为空" \
  || { echo "FAIL: packages 已有内容，02 可能已开工"; }

[ ! -d frontend/liangzui-ai-web ] \
  && echo "OK: liangzui-ai-web 尚未创建" \
  || { echo "FAIL: Web 壳已存在，属于 12 的产物"; }

# 处置表声称 scripts/ 不存在，核对一下
[ ! -d scripts ] \
  && echo "OK: scripts/ 确实不存在，与处置表一致" \
  || echo "NOTE: scripts/ 已存在，处置表需更新"
```
