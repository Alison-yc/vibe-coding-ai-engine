# 01 · 整体架构

| 项   | 值     |
| ---- | ------ |
| 阶段 | 前置   |
| 依赖 | 00     |
| 状态 | 未开始 |

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
│    features/agent stores/  hooks/                             │
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

**壳薄、业务厚。** 你选了"一套代码两个端"。如果业务代码写在 Tauri 应用里，Web 端就得复制一份，两边立刻开始漂移。所以业务全部下沉到 `packages/app-core`，壳只负责三件事：挂路由、注入 platform 实现、包一层全局 Provider。

**平台差异靠接口隔离，不靠条件判断。** 业务代码里不允许出现 `if (isTauri)`。差异收敛到 `packages/platform` 的接口，两个壳各注入一套实现：

| 能力           | Web 实现             | Tauri 实现           |
| -------------- | -------------------- | -------------------- |
| 选择工作区目录 | 提示用户手动输入路径 | 原生目录选择对话框   |
| 本地键值存储   | `localStorage`       | Rust 侧 SQLite       |
| 后端基址       | 同源 / 环境变量      | 从设置页读取，可配置 |
| 打开外部链接   | `window.open`        | `plugin-opener`      |

**契约层是前后端唯一的类型来源。** 所有跨进程数据结构（HTTP 请求响应、SSE 事件、工作流图 DSL、消息 part、工具 schema）都定义在 `packages/contracts` 的 zod schema 里。前端 import 类型，后端 import 同一份 schema 做运行时校验。这解决了全栈项目最常见的腐化点：接口改了前端不知道。

**Agent 的文件操作在服务端，不在 Rust 层。** 详细理由见 `10`。核心是工具执行必须与 LLM 循环同进程，否则每次 tool call 都要跨 IPC，且要维护 Rust 与 TS 两套工具实现。

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

## 端口与进程

| 进程                  | 端口  | 启动方式                          |
| --------------------- | ----- | --------------------------------- |
| Ollama                | 11434 | 系统服务，已在本机运行            |
| PostgreSQL + pgvector | 5432  | `docker compose up -d`            |
| NestJS                | 3000  | `pnpm dev:server`                 |
| Vite（Web 壳）        | 5173  | `pnpm dev:web`                    |
| Vite（Tauri 壳）      | 1420  | `pnpm dev:app`（已配 strictPort） |

## 目标目录结构

`02` 负责把当前仓库改造成这个形态。

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

| 现状                                                                                      | 处置                                      | 在哪个 plan |
| ----------------------------------------------------------------------------------------- | ----------------------------------------- | ----------- |
| `frontend/package.json`（孤立空壳，未被 `frontend/*` glob 匹配到，实际不在 workspace 内） | 删除，改建 `frontend/liangzui-ai-web/`    | 02          |
| `packages/`（空目录）                                                                     | 建 6 个子包                               | 02 / 03     |
| 根 `package.json`（npm init 默认模板）                                                    | 重写为 workspace 根                       | 02          |
| 4 个 0 字节配置文件                                                                       | 填充                                      | 02          |
| `fundamentals/ollama.ts`（模块级单例、numCtx 2048、numPredict 128）                       | 重构为 `LlmGateway`，参数按 04 实测值调整 | 04          |
| `fundamentals/rag.ts`（MemoryVectorStore、硬编码 5 条知识）                               | 重构为 pgvector + 真实文档流水线          | 05 / 06     |
| `fundamentals/translate.ts`                                                               | 保留为 LLM 网关的第一个冒烟用例           | 04          |
| `app.controller.ts`（GET 传业务参数）                                                     | 改为 POST + DTO 校验                      | 03          |
| Tauri `commands.rs`（greet/say_hello 示例）                                               | 替换为真实的 platform 能力命令            | 12          |
| `clients/.../src/App.tsx`（官方示例页）                                                   | 替换为路由 + Provider 装配                | 12          |

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
