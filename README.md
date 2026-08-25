# AI-Engine

本地优先的 AI 全栈实验项目。三个核心能力：**RAG 知识库对话**、**可视化工作流编排**、**本地文件 Agent**。

所有模型跑在本机 Ollama，不依赖任何云端 API。同一套业务代码同时交付浏览器 Web 应用与 macOS 桌面应用（dmg）。

> 这是一个学习型项目，目标是完整走通 AI 应用的工程链路——从模型能力量化、契约驱动开发、插件化架构，到测试门禁、安全扫描与 CI。
> 完整的设计文档与开发计划在 [`.plan/`](./.plan/README.md)。

## 当前状态

**愿景与架构已冻结**（`.plan/00`、`.plan/01`）。工程底座尚未实施：`packages/` 仍为空，`scripts/` 尚未创建，Web 壳目录尚未建立。当前执行点是 [CR-01](./.plan/README.md#当前执行点模型每次开工先看这里)：完成 `02` 与 `15-A` 的测试运行器底座。**不要跳到对话页或工作流。**

| 模块                                     | 状态             |
| ---------------------------------------- | ---------------- |
| 愿景与范围                               | 已冻结           |
| 整体架构与分层不变量                     | 已冻结           |
| 工程底座（monorepo、契约层、工具链、CI） | 计划就绪，未实施 |
| 模型能力基线测评                         | 计划就绪，未实施 |
| RAG 知识库 + 对话助手                    | 计划就绪，未实施 |
| 工作流编排引擎                           | 计划就绪，未实施 |
| 本地文件 Agent                           | 计划就绪，未实施 |
| 双端交付与 dmg 打包                      | 计划就绪，未实施 |

进度看板见 [`.plan/README.md`](./.plan/README.md)。

## 技术栈

| 层     | 技术                                                              |
| ------ | ----------------------------------------------------------------- |
| 桌面端 | Tauri v2（Rust）+ React 19 + Vite                                 |
| Web 端 | React 19 + Vite                                                   |
| UI     | shadcn/ui + Tailwind CSS v4，多主题                               |
| 状态   | TanStack Query（服务端数据）+ zustand（交互态）                   |
| 画布   | @xyflow/react v12                                                 |
| 契约   | zod（前后端唯一类型来源）                                         |
| 服务端 | NestJS 11 + LangChain / LangGraph                                 |
| 数据   | PostgreSQL + pgvector，Drizzle ORM                                |
| 模型   | Ollama：qwen3.5:2b / gemma4:e2b / nomic-embed-text                |
| 构建   | pnpm workspace + Turborepo                                        |
| 测试   | Vitest 4 + Playwright，覆盖率阈值门禁                             |
| 安全   | Semgrep（含 11 条自定义规则）+ OSV-Scanner + Gitleaks，SARIF 汇总 |

## 目录结构

```
├── .cursor/rules/            AI 协作规则（10 条，含架构与安全红线）
├── .plan/                    ★ 开发计划（22 份文档，唯一权威计划源）
├── .github/workflows/        CI（分层流水线 + 安全扫描）
├── docker/                   PostgreSQL + pgvector
├── scripts/                  模型基线测评 / RAG 评测 / 测试生成
├── packages/
│   ├── contracts/            zod schema + 类型（前后端共享）
│   ├── platform/             平台能力接口 + web/tauri 两套实现
│   ├── ui/                   shadcn 组件 + 主题令牌
│   ├── app-core/             ★ 业务功能（端无关，两个壳共用）
│   ├── tsconfig/             共享 TS 配置
│   └── eslint-config/        共享 ESLint 配置
├── clients/liangzui-ai-app/  Tauri 桌面壳（薄）
├── frontend/liangzui-ai-web/ 浏览器 Web 壳（薄）
└── servers/liangzui-ai-server/  NestJS
```

`packages/` 下的多数子目录与 `frontend/liangzui-ai-web` 尚未创建，由 [`.plan/02`](./.plan/02-monorepo-and-toolchain.md) 负责建立。

## 快速开始

### 前置要求

| 依赖           | 版本   | 检查命令           |
| -------------- | ------ | ------------------ |
| Node.js        | ≥ 24   | `node -v`          |
| pnpm           | ≥ 11   | `pnpm -v`          |
| Rust           | stable | `rustc --version`  |
| Docker Desktop | —      | `docker --version` |
| Ollama         | —      | `ollama list`      |

### 拉取模型

```bash
ollama pull qwen3.5:2b
ollama pull nomic-embed-text
ollama pull gemma4:e2b        # 可选，7.2GB，长上下文备选
```

### 启动

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env

# 3. 启动数据库（首次会拉取 pgvector 镜像）
pnpm dev:db

# 4. 应用数据库迁移
pnpm db:migrate

# 5. 启动服务端（终端 1）
pnpm dev:server

# 6. 启动前端，二选一
pnpm dev:web      # 浏览器版 → http://localhost:5173
pnpm dev:app      # 桌面版（Tauri 窗口）
```

### 常用命令

```bash
pnpm ci:local          # 本地跑一遍 CI 的全部门禁（推送前必做）
pnpm test:cov          # 测试 + 覆盖率门禁
pnpm baseline          # 模型能力基线测评
pnpm rag-eval          # RAG 效果评测
pnpm sec:all           # 全部安全扫描
pnpm db:studio         # 可视化查看数据库
pnpm tauri:build       # 打包 dmg
```

端口占用一览：Ollama `11434`、Postgres `5432`、NestJS `3000`、Web `5173`、Tauri `1420`。

## 桌面端安装说明

本项目**未做 Apple 开发者签名**（需付费账号）。从 dmg 安装后首次打开会被 Gatekeeper 拦截，这是正常的，不是应用损坏：

```bash
xattr -cr /Applications/liangzui-ai-app.app
```

桌面端默认连接 `http://localhost:3000`，可在应用内的设置页修改地址与端口。后端与数据库需要单独启动。

## 已知限制

这些是设计前提，不是待修的缺陷。如实列出比藏起来更有价值。

| 限制                     | 说明                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型只有 2B 级别         | qwen3.5:2b 的工具调用可靠性、指令遵循、长上下文表现都显著低于云端大模型。功能设计以 [`.plan/04`](./.plan/04-model-baseline-and-llm-gateway.md) 的实测数据为边界 |
| 中文向量检索质量有天花板 | nomic-embed-text 是 768 维通用模型，中文效果一般。检索指标见 RAG 评测报告                                                                                       |
| 单用户                   | 无多租户、无权限体系                                                                                                                                            |
| 仅 macOS 桌面包          | 不构建 Windows / Linux                                                                                                                                          |
| 无云端部署               | 模型在本机，部署上云也访问不到                                                                                                                                  |
| 完整 E2E 不在 CI 跑      | GitHub runner 没有模型。CI 只跑 smoke，完整 E2E 本地执行                                                                                                        |
| 无 `bash` 类工具         | Agent 只提供文件读写与搜索。命令执行对 2B 模型的风险收益比不合适                                                                                                |

## 安全

项目会读写本地文件、执行用户提供的代码、把不可信文本喂给模型，因此有真实的攻击面。防护措施与威胁模型见 [`SECURITY.md`](./SECURITY.md) 与 [`.plan/16`](./.plan/16-security-sast-dast.md)。

核心机制：Agent 文件操作的三层防护（路径沙箱 → 权限规则 → 用户审批）、工作流 code 节点的 WASM 沙箱、http 节点的 SSRF 拦截、检索内容的提示词注入隔离。

## 参与开发

先读 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 与 [`.plan/README.md`](./.plan/README.md)。AI 辅助开发时的规则约定在 [`AGENTS.md`](./AGENTS.md) 与 `.cursor/rules/`。

## 致谢

架构设计参考了两个开源项目：

- [Dify](https://github.com/langgenius/dify) —— 工作流的三层节点注册表、变量选择器、RAG 索引流水线的分阶段设计
- [opencode](https://github.com/sst/opencode) —— Agent 循环结构、统一 Tool 接口、三层权限模型、durable inbox

## License

MIT
