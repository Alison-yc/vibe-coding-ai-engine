# AI-Engine

本地优先的 AI 全栈实验项目。三个核心能力：**RAG 知识库对话**、**可视化工作流编排**、**本地文件 Agent**。

所有模型跑在本机 Ollama，不依赖任何云端 API。同一套业务代码同时交付浏览器 Web 应用与 macOS 桌面应用（dmg）。

> 这是一个学习型项目，目标是完整走通 AI 应用的工程链路——从模型能力量化、契约驱动开发、插件化架构，到测试门禁、安全扫描与 CI。
> 完整的设计文档与开发计划在 [`.plan/`](./.plan/README.md)。

## 当前状态

M0～M5 已完成，含 Web/桌面双端、会话模型切换与 NestJS sidecar。当前执行点见
[`.plan/README.md`](./.plan/README.md#当前执行点模型每次开工先看这里)。

| 模块                                     | 状态           |
| ---------------------------------------- | -------------- |
| 愿景与范围                               | 已冻结         |
| 整体架构与分层不变量                     | 已冻结         |
| 工程底座（monorepo、契约层、工具链、CI） | 已完成         |
| 模型能力基线测评                         | 已完成         |
| RAG 知识库 + 统一对话助手                | 已完成         |
| 工作流编排引擎                           | 已完成         |
| 文件访问与 MCP 工具                      | 已并入统一对话 |
| macOS dmg + NestJS sidecar               | 已完成         |
| 界面中日英                               | 已完成         |

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
| 服务端 | NestJS 11 + Ollama 网关 + 自建工作流引擎                          |
| 数据   | PostgreSQL + pgvector，Drizzle ORM                                |
| 模型   | Ollama：qwen3.5:2b / gemma4:e2b / nomic-embed-text                |
| 构建   | pnpm workspace + Turborepo                                        |
| 测试   | Vitest 4 + Playwright，覆盖率阈值门禁                             |
| 安全   | Semgrep（含 11 条自定义规则）+ OSV-Scanner + Gitleaks，SARIF 汇总 |

## 架构

```text
Tauri 壳 ─┐
          ├─ packages/app-core（页面、业务状态、请求编排）
Web 壳 ───┘          │
                     ├─ packages/platform（Web / Tauri 能力适配）
                     ├─ packages/ui（无业务语义的组件与主题）
                     └─ packages/contracts（共享 zod 契约）
                                      │
                               NestJS Server
                       ┌──────────────┼──────────────┐
                    Ollama       PostgreSQL      MCP Servers
                 对话 / 向量化     + pgvector      可选工具
```

`packages/app-core` 不直接访问 Tauri、浏览器存储或 Node API；跨进程结构只在
`packages/contracts` 定义。桌面壳在 release 中管理 NestJS sidecar，Web 壳连接独立
NestJS 服务。

### Web / 桌面功能对照

| 能力                | Web                        | macOS 桌面                 |
| ------------------- | -------------------------- | -------------------------- |
| 对话、RAG、工作流   | 共用 `app-core`            | 共用 `app-core`            |
| 本地模型切换        | 已测评模型开放对应能力     | 已测评模型开放对应能力     |
| 文件工作区          | 输入服务端可访问的绝对路径 | 系统原生目录选择器         |
| NestJS              | 单独执行 `pnpm dev:server` | release 包自动启动 sidecar |
| 后端地址            | 环境变量或本地设置         | 启动引导与设置页           |
| PostgreSQL / Ollama | 本机提供                   | 本机提供                   |
| 路由                | History                    | Hash                       |

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
pnpm build             # 编译各 workspace，不生成桌面安装包
pnpm tauri:build       # 打包 macOS app 与 dmg，自动附加构建版本
```

端口占用一览：Ollama `11434`、Postgres `5432`、NestJS `3000`、Web `5173`、Tauri `1420`。

## 桌面端安装说明

打包版会随应用自动启动 NestJS sidecar，**不必**再执行 `pnpm dev:server`。PostgreSQL 与 Ollama 仍须本机提供。

开发调试（不会自动起 sidecar）请用上一节的 `pnpm dev:server` + `pnpm dev:app`。

构建并安装：

```bash
pnpm dev:db
pnpm db:migrate
# 确认 Ollama 已在 11434 运行，并已拉取 qwen3.5:2b / nomic-embed-text
pnpm tauri:build
```

本地构建版本格式为 `0.1.<UTC年月日时分秒>`，因此连续构建的 dmg 文件名可直接区分。
需要指定正式版本时使用 `AI_ENGINE_APP_VERSION=0.2.0 pnpm tauri:build`；GitHub 推送
`vX.Y.Z` 标签触发 Release 时会自动采用 `X.Y.Z`。

构建产物位于：

- dmg：`clients/liangzui-ai-app/src-tauri/target/release/bundle/dmg/*.dmg`
- app：`clients/liangzui-ai-app/src-tauri/target/release/bundle/macos/liangzui-ai-app.app`
- Web 静态资源：`frontend/liangzui-ai-web/dist/`

打开生成的 dmg，将 `liangzui-ai-app.app` 拖入 `/Applications`。首次启动会把
`sidecar.env` 写到 `~/Library/Application Support/com.liangzui.liangzui-ai-app/`，
日志在 `~/Library/Logs/com.liangzui.liangzui-ai-app/sidecar.log`。

调试安装版配置时可直接打开该目录，修改 `sidecar.env` 或 `mcp.json` 后需完全退出并
重新打开应用：

```bash
open "$HOME/Library/Application Support/com.liangzui.liangzui-ai-app/"
```

Sidecar 使用动态端口；启动失败或数据库未就绪时会显示连接引导，可在引导页或设置页
把地址改成实际的 `http://127.0.0.1:<端口>`。仅允许 localhost / 127.0.0.1。

文件访问始终受服务端白名单与工作区路径沙箱共同限制。Web 和 `pnpm dev:app` 连接手动
启动的服务端，可访问范围由 `.env` 的 `AGENT_WORKSPACE_ROOTS` 决定。安装版的原生
目录选择器只负责填写路径，不会自动扩大服务端权限；首次使用前需在上述 `sidecar.env`
中显式配置允许的根目录，例如
`AGENT_WORKSPACE_ROOTS=<YOUR_PATH>:/tmp/ai-engine-sandbox`。macOS 多个根目录用冒号
分隔，修改后需重启应用；留空时文件访问会返回明确的配置提示。

本项目**未做 Apple 开发者签名和公证**（需要付费账号）。从 dmg 安装后首次打开可能被
Gatekeeper 拦截，这是正常的，不是应用损坏。可先在 Finder 中右键选择“打开”；仍被拦截时执行：

```bash
xattr -cr /Applications/liangzui-ai-app.app
```

### 只收到 dmg 时

无需源码、Node.js、pnpm 或 Rust。安装 Docker Desktop 与 Ollama 后执行：

```bash
docker run -d \
  --name ai-engine-postgres \
  --health-cmd="pg_isready -U ai_engine -d ai_engine" \
  --health-interval=5s \
  --health-timeout=5s \
  --health-retries=10 \
  --health-start-period=10s \
  -e POSTGRES_USER=ai_engine \
  -e POSTGRES_PASSWORD=ai_engine_dev_only \
  -e POSTGRES_DB=ai_engine \
  -e POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale=C" \
  -p 5432:5432 \
  -v ai-engine-postgres-data:/var/lib/postgresql/data \
  pgvector/pgvector:pg17

until docker exec ai-engine-postgres pg_isready -U ai_engine -d ai_engine; do sleep 1; done

ollama pull qwen3.5:2b
ollama pull nomic-embed-text
ollama pull gemma4:e2b # 可选
```

没有源码时不必挂载 `docker/init/`。打开应用后 sidecar 会自动跑 Drizzle 迁移（含 `vector` / `pgcrypto` / `pg_trgm` 扩展）。`qwen3.5:2b` 是默认且覆盖完整基线的模型；
`gemma4:e2b` 只实测了单轮 A/C/G 工具阶梯，不外推两步或嵌套参数能力；扫描到的其他
模型只允许对话。`nomic-embed-text` 只用于 768 维向量化，不会出现在对话模型选择器。

若已有同名容器，使用 `docker start ai-engine-postgres`。连接失败时先检查：

```bash
docker ps --filter name=ai-engine-postgres
curl http://127.0.0.1:11434/api/tags
```

## RAG 评测

固定人工标注集包含 30 条检索、30 条问答、15 条拒答和 10 条提示词注入样本。规则化
指标不使用 2B 模型自评。PostgreSQL 同环境基线与三组单变量实验均使用
`qwen3.5:2b`、`nomic-embed-text:latest`、递归切分、`numCtx=8192`：

| 配置                                     | Recall@k |    MRR | 关键词覆盖率 | 拒答正确率 | 注入抵抗率 |
| ---------------------------------------- | -------: | -----: | -----------: | ---------: | ---------: |
| 基线：chunk 500 / topK 5 / threshold 0.3 |   0.7000 | 0.5911 |       0.7444 |          1 |     0.9000 |
| chunk 300（其余同基线）                  |   0.7000 | 0.5911 |       0.7278 |          1 |     0.9000 |
| topK 3（其余同基线，此行 Recall@3）      |   0.6333 | 0.5778 |       0.5944 |          1 |     1.0000 |
| threshold 0.2（其余同基线）              |   0.7000 | 0.5911 |       0.7000 |          1 |     0.9000 |

报告：
[同环境基线](./scripts/rag-eval/reports/20260828-0527-postgres-baseline.md)、
[chunk 300](./scripts/rag-eval/reports/20260828-0529-chunk-size-300.md)、
[topK 3](./scripts/rag-eval/reports/20260828-0531-top-k-3.md)、
[threshold 0.2](./scripts/rag-eval/reports/20260828-0533-threshold-0-2.md)。

单变量归因请对比同环境基线，不要读实验报告里的「相比上次」（那是目录时间序）：

```bash
pnpm rag-eval:compare \
  scripts/rag-eval/reports/20260828-0527-postgres-baseline.md \
  scripts/rag-eval/reports/20260828-0529-chunk-size-300.md
pnpm rag-eval:compare \
  scripts/rag-eval/reports/20260828-0527-postgres-baseline.md \
  scripts/rag-eval/reports/20260828-0531-top-k-3.md
pnpm rag-eval:compare \
  scripts/rag-eval/reports/20260828-0527-postgres-baseline.md \
  scripts/rag-eval/reports/20260828-0533-threshold-0-2.md
```

三组实验都没有提升检索指标：chunk 300 与 threshold 0.2 持平，topK 3 的 Recall
下降 6.67 个百分点。拒答正确率均为 100%，但生成指标存在本地小模型非确定性。因此
保留 chunk 500、topK 5、threshold 0.3，不为追求单次生成波动修改默认值。

## 5 分钟演示提纲

1. **0:00–0:40**：说明本地 Ollama、NestJS、PostgreSQL 与 Web/Tauri 双壳分层。
2. **0:40–1:40**：导入知识库文档，展示五阶段索引、检索分数、对话引用与拒答。
3. **1:40–2:40**：创建工作流，运行条件、HTTP 与 QuickJS/WASM code 节点，展示日志。
4. **2:40–3:50**：在统一对话中切换已测评模型，开启文件访问，展示原生目录选择与审批 diff。
5. **3:50–4:30**：连接 MCP 工具，说明 6 工具上限、未知模型只聊天及失败兜底。
6. **4:30–5:00**：展示 RAG 对比报告、测试覆盖率、安全扫描和 dmg sidecar 自动启动。

## 已知限制

这些是设计前提，不是待修的缺陷。如实列出比藏起来更有价值。

| 限制                     | 说明                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型只有 2B 级别         | qwen3.5:2b 的工具调用可靠性、指令遵循、长上下文表现都显著低于云端大模型。功能设计以 [`.plan/04`](./.plan/04-model-baseline-and-llm-gateway.md) 的实测数据为边界 |
| 中文向量检索质量有天花板 | nomic-embed-text 是 768 维通用模型，中文效果一般。检索指标见上方可复现的 RAG 评测报告                                                                           |
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
