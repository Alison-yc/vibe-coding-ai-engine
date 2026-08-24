# 开发指南

这是个单人学习项目，但仍然按团队规范来做——工程习惯是这个项目要练的东西之一。

## 环境准备

版本要求见 [README](./README.md#前置要求)。`.nvmrc` 已指定 Node 版本，用 nvm 的话 `nvm use` 即可。

pnpm 通过 `package.json` 的 `packageManager` 字段锁定版本，用 corepack 启用：

```bash
corepack enable
```

可选但建议装的两个工具（不装 CI 也会跑，只是本地少一层保护）：

```bash
brew install gitleaks   # 提交前密钥扫描
brew install semgrep    # 本地跑 SAST
```

## 工作流程

### 1. 从 `.plan/` 找到要做的事

`.plan/` 是唯一权威计划源。每份 plan 都有明确的实施步骤和验收标准（DoD）。按里程碑顺序推进，不要跳步——`.plan/README.md` 里标了依赖关系，跳步会踩到未就绪的前置。

特别地：**`.plan/04`（模型能力基线）必须在任何 AI 功能之前完成。** 不知道 2B 模型的真实能力边界就设计功能，等于闭着眼睛写。

### 2. 建分支

```bash
git switch -c feat/rag-pdf-indexing
```

前缀用 `feat/` `fix/` `refactor/` `docs/` `chore/` `test/`。

### 3. 写代码

先看 `.cursor/rules/` 里对应目录的规则，再看邻近文件的既有写法。这个仓库有一些既定模式，照抄比自己发明一套好。

### 4. 自检

```bash
pnpm ci:local
```

这一条命令依次跑 format 检查、lint（含架构护栏）、typecheck、测试与覆盖率门禁、Semgrep、构建。推送前必做——在本地看到失败比在 CI 等五分钟再看到失败快得多。

想连 SCA 和密钥扫描一起跑，用 `pnpm ci:local:full`。

### 5. 提交

```bash
git commit -m "feat(rag): 支持 PDF 文档分块索引"
```

pre-commit 钩子会对暂存文件跑 lint-staged 和密钥扫描，commit-msg 钩子会校验格式。

**不要用 `--no-verify`。** 钩子挡住的时候是它在干活。真的需要绕过（比如钩子本身坏了），修钩子。

### 6. 开 PR

按 PR 模板填。重点是"怎么验证"那一栏要写可直接复制执行的命令。

## 提交信息规范

Conventional Commits。格式：

```
<type>(<scope>): <描述>
```

`type` 与 `scope` 的可选值以 `commitlint.config.js` 为准（那里是唯一真源，改了以那份为准）。常用的：

| type           | 用途               |
| -------------- | ------------------ |
| `feat`         | 新功能             |
| `fix`          | 修 bug             |
| `refactor`     | 重构，行为不变     |
| `test`         | 只动测试           |
| `docs`         | 只动文档           |
| `chore`        | 依赖、配置、脚手架 |
| `perf`         | 性能优化           |
| `build` / `ci` | 构建与流水线       |

描述用中文，动词开头，说清做了什么。50 字以内。

```
✅ feat(workflow): 新增条件分支节点
✅ fix(agent): 修正符号链接路径逃逸沙箱的问题
❌ update code
❌ 修改了一些文件
❌ feat: 完成了工作流引擎、RAG 检索、Agent 工具三个模块   ← 一次改太多
```

## 改动粒度

一个提交一件事。判断标准：能用一句话说清楚，且不需要"和"。

**不要**在功能提交里顺手做这些事，它们会让 diff 无法审查：

- 重构无关代码
- 调整格式（格式交给 Prettier，不要手动改）
- 升级依赖
- 重命名不相关的变量

## 测试要求

分层策略见 [`.plan/15`](./.plan/15-testing-and-llm-testgen.md)。三条硬性要求：

**1. 业务逻辑测试不调真实模型。** 用 `FakeLlmGateway` 注入固定输出。理由：真实模型让测试变慢、变不稳定，而且 CI 上根本没有模型。

**2. 断言要能失败。** 写完一个测试，把实现改坏，确认它变红。`expect(x).toBeDefined()` 这类永真断言等于没测。

**3. 覆盖率门禁不能靠调低阈值来过。** 阈值按包分层配置在 `vitest.config.ts`（`contracts` 最严，`clients` 最松）。测试不够就补测试。确实有无法测试的代码，用 `/* v8 ignore next */` 并写明理由。

安全相关代码（路径沙箱、code 节点沙箱、SSRF 拦截、Markdown 渲染）必须有针对性的攻击用例，和实现放在同一个 PR。

## 常用命令

```bash
# 开发
pnpm dev:db              启动 Postgres
pnpm dev:server          启动 NestJS（watch）
pnpm dev:web             启动 Web 端
pnpm dev:app             启动 Tauri 桌面端

# 质量
pnpm lint                ESLint（含架构护栏）
pnpm lint:fix            自动修
pnpm format              Prettier 格式化
pnpm typecheck           全量类型检查
pnpm test                跑一遍测试
pnpm test:watch          watch 模式
pnpm test:cov            测试 + 覆盖率门禁
pnpm test:security       只跑安全用例
pnpm ci:local            上述门禁 + Semgrep + 构建，全跑一遍
pnpm ci:local:full       再加上 SCA 与密钥扫描

# 数据库
pnpm db:generate         从 schema 生成迁移
pnpm db:migrate          应用迁移
pnpm db:studio           可视化查看

# 模型与评测
pnpm baseline            模型能力基线测评
pnpm rag-eval            RAG 效果评测
pnpm gen-tests           LLM 生成测试草稿（需人工审核，见 .plan/15）

# 安全
pnpm sec:sast            Semgrep
pnpm sec:sca             依赖漏洞
pnpm sec:secrets         密钥扫描
pnpm sec:all             全部

# 打包
pnpm tauri:build         构建 dmg
```

## 排障

### 数据库连不上

```bash
cd docker && docker compose ps          # 容器在跑吗
cd docker && docker compose logs postgres
```

**改了 `docker/init/*.sql` 却不生效**：那些脚本只在数据卷为空时执行一次。必须 `docker compose down -v` 删掉数据卷重建（数据会全丢）。这是 Docker 最容易困惑的行为。

### Ollama 相关

```bash
ollama list                              # 模型在吗
curl http://localhost:11434/api/tags     # 服务在吗
```

**生成到一半就截断**：`numPredict` 太小。**长文档 RAG 答案质量差**：`numCtx` 不够，检索内容被截掉了。这两个参数的取值以 `.plan/04` 基线测评的实测结果为准，不要凭感觉调大——`numCtx` 调太大会在 16G 内存机器上触发 swap，首 token 延迟涨好几倍。

### 端口冲突

```bash
lsof -i :3000    # 换成对应端口
```

占用一览：Ollama `11434`、Postgres `5432`、NestJS `3000`、Web `5173`、Tauri `1420`。

### Tauri 构建失败

```bash
cd clients/liangzui-ai-app/src-tauri && cargo clean
```

Rust 依赖缓存出问题时清一下。首次构建会编译几百个 crate，慢是正常的。

### 打开 dmg 装的应用被拦

项目未做 Apple 签名，正常现象：

```bash
xattr -cr /Applications/liangzui-ai-app.app
```

## 文档维护

- **技术决策**有取舍的，追加 ADR 到 [`.plan/20-adr-and-risks.md`](./.plan/20-adr-and-risks.md)。记录"当时为什么这么选"，几个月后回看会很有用。
- **计划变更**直接改对应的 `.plan/` 文件，不要新建"修订版"。
- **不要**新建计划外的总结类文档。已经有 22 份 plan，再加只会让人不知道该看哪份。
