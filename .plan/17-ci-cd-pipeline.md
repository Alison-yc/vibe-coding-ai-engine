# 17 · CI 流水线

| 项       | 值                                     |
| -------- | -------------------------------------- |
| 阶段     | M0（骨架），随功能增强                 |
| 依赖     | 17-A：02/15-A/16-A；后续阶段见子阶段表 |
| 预计工期 | 2 天                                   |
| 状态     | 未开始                                 |

## 子阶段状态

| 子阶段 | 内容                                           | 所属批次                 | 状态   |
| ------ | ---------------------------------------------- | ------------------------ | ------ |
| 17-A   | 快速门禁、测试、构建、安全 job、缓存、变更检测 | CR-04                    | 未开始 |
| 17-B   | Postgres service container 与数据库集成测试    | CR-06                    | 未开始 |
| 17-C   | tag 触发的 macOS release / dmg artifact        | CR-16（本机 dmg 通过后） | 未开始 |

CI 只接入已经在本地跑通的命令。不要先写一个“看起来完整”的 workflow，再让后续实现迁就它。

## 当前状态：已有骨架，尚未完成远端验收

规划阶段已经创建：

- `.github/workflows/ci.yml`
- `.github/workflows/security.yml`
- `.github/dependabot.yml`
- `.github/pull_request_template.md`

这些文件只能证明“本地有 YAML 骨架”，不能证明 GitHub Actions 已成功运行、SARIF 能上传、缓存与变更检测有效。CR-04 必须以当前文件为起点审查和修正，**不要从零覆盖**。

远端分支保护、Actions 运行结果和仓库是否启用 Code Scanning，当前信息无法从本地文件确认，实施时需要在 GitHub 上验证。

## 目标

一套分层的 GitHub Actions 流水线：快的先跑、慢的后跑、失败早退出。同时保证 `pnpm ci:local` 能在本地完整复现。

## 核心约束：CI 上没有模型和 GPU

GitHub runner 上：

| 依赖                  | CI 上可用吗             | 影响                         |
| --------------------- | ----------------------- | ---------------------------- |
| Node / pnpm           | ✅                      | —                            |
| Rust                  | ✅（需 setup action）   | —                            |
| PostgreSQL + pgvector | ✅（service container） | 集成测试可跑                 |
| **Ollama + 模型**     | ❌                      | 所有需要真实模型的测试跑不了 |

所以流水线的设计原则是：**单测、契约测试、集成测试全部不依赖模型**（靠 `FakeLlmGateway`）。需要真实模型的验证（E2E 完整流程、模型基线测评、RAG 评测）只在本地跑。

这不是妥协，是正确的测试设计——依赖真实 LLM 的测试本来就不该进 CI（慢、不稳定、结果不可重复）。

## 流水线分层

```
push / PR
    │
    ├── ① 快速门禁（并行，~2 分钟）      失败则不进入后续
    │     ├─ format:check
    │     ├─ lint
    │     ├─ typecheck
    │     └─ commitlint（仅 PR，检查全部提交信息）
    │
    ├── ② 测试（~5 分钟）
    │     ├─ 单测 + 契约测试（无外部依赖）
    │     ├─ 集成测试（postgres service container）
    │     └─ 覆盖率阈值门禁 ★
    │
    ├── ③ 安全（并行于 ②，~4 分钟）
    │     ├─ Semgrep SAST → SARIF
    │     ├─ SCA（npm + Cargo）
    │     └─ Gitleaks → SARIF
    │
    ├── ④ 构建（依赖 ①②）
    │     ├─ 各包 build
    │     ├─ Rust: cargo fmt --check + clippy -D warnings
    │     └─ Web 端 smoke（启动 + 首屏渲染 + 无控制台报错）
    │
    └── ⑤ 桌面端打包（仅 tag 触发，macOS runner）
          └─ tauri build → dmg 作为 release artifact
```

### 为什么这样分层

| 设计               | 理由                                                             |
| ------------------ | ---------------------------------------------------------------- |
| 快速门禁独立且最先 | 格式/lint 错误 30 秒就能发现，不该等 5 分钟的测试跑完            |
| 安全与测试并行     | 两者无依赖关系，并行省时间                                       |
| 构建放最后         | 构建最慢，前面都过了再构建                                       |
| 打包只在 tag 触发  | macOS runner 贵（计费是 Linux 的 10 倍），每次 push 都打包是浪费 |

## 关键实现细节

### 变更检测（省时间）

用 `dorny/paths-filter` 判断改了哪些包，只跑相关的 job：

| 变更路径                      | 触发                   |
| ----------------------------- | ---------------------- |
| `packages/**`                 | 全部（共享包影响所有） |
| `servers/**`                  | 服务端测试             |
| `clients/**` + `src-tauri/**` | Rust 检查              |
| `frontend/**`                 | Web 构建               |
| `.plan/**`、`*.md`            | 只跑 format:check      |

改文档不应该触发全量 CI。

### Turbo 缓存

用 `actions/cache` 缓存 `.turbo`。key 基于 `pnpm-lock.yaml` 哈希 + 分支。

**注意**：turbo 的 `globalEnv` 必须配置完整，否则环境变量变了缓存不失效，CI 会给出基于旧代码的结果——这是最难排查的一类 CI 问题。

### pnpm 缓存

`pnpm/action-setup` + `actions/setup-node` 的 `cache: 'pnpm'`。装依赖用 `--frozen-lockfile`（lockfile 与 package.json 不一致时直接失败，防止 CI 上意外升级依赖）。

### Postgres service container

集成测试需要带 pgvector 的 Postgres。用 `pgvector/pgvector:pg17` 作为 service container，配 healthcheck 等它就绪。

初始化的 `CREATE EXTENSION vector` 在迁移里做，或在测试的 globalSetup 里做（service container 不支持挂载初始化脚本目录）。

### 覆盖率门禁

Vitest 的 `coverage.thresholds` 不达标会自己退出非零，不需要额外脚本。同时把 `coverage/` 作为 artifact 上传，方便失败时下载查看具体哪个文件掉了。

### SARIF 上传

用 `github/codeql-action/upload-sarif`。三个工具的结果分别上传，用 `category` 区分。

若仓库是私有且没有 Advanced Security，改为把 `.sarif` 作为普通 artifact 上传。

### Rust 检查

`dtolnay/rust-toolchain` + `Swatinem/rust-cache`（Rust 编译很慢，没缓存每次要几分钟）。

检查项：`cargo fmt --check`、`cargo clippy -- -D warnings`。**不在 CI 跑 `cargo build --release`**，那是打包 job 的事。

### Web smoke test

构建产物起一个静态服务，用 Playwright 打开首页，断言：页面渲染出内容、控制台无 error。

这能挡住"构建成功但运行时白屏"这类问题（常见于路径别名配错、动态 import 失败）。

## 分支保护

在 GitHub 仓库设置里配（不是 workflow 文件）：

| 规则           | 值                      |
| -------------- | ----------------------- |
| 保护分支       | `main`                  |
| 必须通过的检查 | 快速门禁、测试、安全    |
| 必须 PR 合并   | 是（禁止直推 main）     |
| 必须解决对话   | 是                      |
| 线性历史       | 建议开（合并用 squash） |

## 本地复现：`pnpm ci:local`

**这个脚本比 CI 本身更重要。** 它让你在推送前 3 分钟内知道 CI 会不会红。

```
pnpm ci:local
  ├─ format:check
  ├─ lint
  ├─ typecheck
  ├─ test:cov（含阈值门禁）
  ├─ sec:sast
  ├─ sec:sca
  └─ build
```

与 CI 的差异只有：不跑集成测试（需要数据库，用 `pnpm ci:local:full` 包含）、不跑 SARIF 上传。

## 实施步骤

1. 拉取远端后核对 workflow；与当前骨架合并，不覆盖未知配置。
2. 审查 `ci.yml`：快速门禁 + 测试 + 构建、paths-filter、turbo/pnpm 缓存。
3. 审查 `security.yml`：Semgrep + SCA + Gitleaks + SARIF 上传。
4. 审查 Dependabot 的 npm + cargo + github-actions 三个生态配置。
5. 审查 PR 模板是否要求 plan、验证命令和破坏性变更说明。
6. 在 `15-A` 完成后接入覆盖率门禁与 artifact 上传。
7. 在 `17-B` 接入 Postgres service container 与集成测试 job。
8. 在 `17-C` 创建 `release.yml`：tag 触发 macOS 打包；`13-A` 通过前不得启用。
9. 配 GitHub 分支保护规则。
10. 核对 `pnpm ci:local` 与 `ci:local:full` 和 CI job 一致。
11. 故意提交一个 lint 错误，验证 CI 真的会红。

## 验收标准（DoD）

### 17-A · CR-04

- [ ] push 后 CI 自动触发，各 job 按设计的层次执行
- [ ] 故意提交格式错误，快速门禁失败且**后续 job 不执行**（早退出生效）
- [ ] 故意让某包覆盖率掉到阈值下，测试 job 失败
- [ ] Semgrep/SCA/Gitleaks 的 SARIF 出现在 GitHub Security 标签页
- [ ] 只改 `.plan/**` 的提交，只触发 format:check（变更检测生效）
- [ ] 第二次 push（无代码变更）命中 turbo 缓存，测试 job 明显变快
- [ ] Rust 的 fmt 与 clippy 检查生效（故意留一个 warning 验证）
- [ ] Web smoke 能挡住构建成功但白屏的情况（可以故意改坏路径别名验证）
- [ ] `pnpm ci:local` 的结果与 CI 一致（同一个 commit，两边都绿或都红）
- [ ] `main` 分支无法直推，必须 PR
- [ ] Dependabot 开始产生依赖升级 PR

### 17-B · CR-06 后

- [ ] 集成测试在 CI 上能连到 Postgres + pgvector 并跑通
- [ ] 数据库 job 不依赖本地 Docker 数据卷或开发机状态

### 17-C · CR-16 后

- [ ] tag 能触发 macOS 构建并上传 dmg artifact
- [ ] 普通 PR 不运行 release job

## 验证命令

```bash
# 本地复现 CI
pnpm ci:local
pnpm ci:local:full        # 含集成测试，需要 docker

# 分项
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:cov
pnpm sec:sast
pnpm sec:sca
pnpm build

# Rust
cd clients/liangzui-ai-app/src-tauri
cargo fmt --check
cargo clippy -- -D warnings

# workflow 语法校验（需装 actionlint）
actionlint .github/workflows/*.yml

# 确认远端是否已有 workflow（本机无 gh CLI，用 git 确认）
git fetch origin && git ls-tree -r origin/main --name-only | grep -i github || echo "远端 main 无 .github"

# 故意制造失败验证 CI 真的有效
echo "const x   =    1" >> packages/contracts/src/index.ts
git add -A && git commit -m "test(ci): 验证 CI 门禁生效" && git push
# 观察 Actions 应该失败在 format:check
git reset --hard HEAD~1 && git push -f    # 仅在个人分支上这样做
```

## 风险与备选

| 风险                                      | 处置                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| GitHub Actions 免费额度用完               | 公开仓库不限量。私有仓库有月度额度——用变更检测减少无效运行，macOS 打包只在 tag 触发  |
| turbo 缓存导致 CI 给出错误的通过结果      | `globalEnv` 配全；怀疑时用 `--force` 对比。这类问题的症状是"本地失败 CI 通过"        |
| Postgres service container 启动慢导致超时 | healthcheck 的 retries 给足；集成测试 job 单独设 timeout                             |
| Rust 编译在 CI 上很慢                     | `Swatinem/rust-cache` 必须配。首次仍会慢（几分钟），后续命中缓存                     |
| 打包 job 需要 macOS runner，计费 10 倍    | 只在 tag 触发。个人项目 tag 不会频繁打                                               |
| SARIF 上传权限不足                        | workflow 需要 `security-events: write` 权限。私有仓库不支持时降级为 artifact         |
| E2E 无法在 CI 跑，覆盖不足                | 已在设计里承认。用 Web smoke 兜住"能不能跑起来"，完整 E2E 本地跑。在 README 里写明   |
| CI 通过但本地跑不起来（或反之）           | `pnpm ci:local` 就是为此设计的。两边脚本要共用同一套命令，不要 CI 里写一套单独的命令 |
