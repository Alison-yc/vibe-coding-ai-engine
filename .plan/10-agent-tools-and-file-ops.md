# 10 · Agent 循环、工具系统与本地文件操作

| 项       | 值                                       |
| -------- | ---------------------------------------- |
| 阶段     | M4 · Agent 与 MCP                        |
| 依赖     | 03、**04（强依赖，必须先完成）**、05、07 |
| 预计工期 | 6～7 天                                  |
| 状态     | 已完成                                   |

## 目标

做一个能对话式操作本地文件的 AI 助手（对应你说的 "openclaw 那样的页面"）：读文件、写文件、精确编辑、按名找文件、按内容搜索，能生成 Markdown 文档并落盘。带完整的三层安全机制。

## 为什么必须先做完 04

这个 plan 的整个设计取决于一个未知数：**qwen3.5:2b 到底能不能可靠地发出 tool call？**

`04` 的工具调用测评会给出七个场景的实测数据。根据结果走两条完全不同的路：

| 04 的结论                                          | 本 plan 走哪条路                  |
| -------------------------------------------------- | --------------------------------- |
| tool call 合法率 > 80%，3 个工具下选择正确率 > 70% | **路线 A**：标准 function calling |
| tool call 基本不可用（合法率 < 50%）               | **路线 B**：结构化输出驱动        |

**在 04 完成前开工这个 plan，有 50% 概率白做。**

### 路线 B 是什么（备选但不丢人）

不依赖模型的 function calling 能力，改为让模型输出约定格式的指令块：

````
我需要先看一下这个文件的内容。

​```action
{"tool": "read", "path": "src/main.ts"}
​```
````

服务端解析代码块、执行、把结果作为下一轮的用户消息回填。

这个方案在弱模型上成功率更高（因为"输出 JSON 代码块"比"发起结构化 function call"对模型的要求低），而且**解析器、重试、错误回填这些工程量反而更大**——从简历角度讲不是降级，是另一种能力的体现。

## 三层安全（顺序不可颠倒）

```
模型请求操作文件
  │
  ├─ 第 1 层：路径沙箱
  │    resolveWorkspacePath() → 越界直接拒绝，模型无从得知
  │
  ├─ 第 2 层：权限规则
  │    evaluate(tool, resource) → allow | deny | ask
  │
  ├─ 第 3 层：用户审批
  │    ask → SSE 推 permission.asked → 阻塞等前端回复
  │
  └─ 执行
```

### 第 1 层：路径沙箱

```ts
async function resolveWorkspacePath(root: string, input: string): Promise<string> {
  const resolved = path.resolve(root, input);
  const realRoot = await fs.realpath(root);
  // 目标可能还不存在（write 新文件），所以解析它的父目录
  const realParent = await fs.realpath(path.dirname(resolved));
  if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
    throw new PathEscapeError(input);
  }
  return resolved;
}
```

必须防的两种逃逸：

| 攻击                         | 为什么字符串检查不够                                           |
| ---------------------------- | -------------------------------------------------------------- |
| `../../../../etc/passwd`     | `path.resolve` 能处理，但要对比结果而不是检查输入里有没有 `..` |
| 工作区内有个符号链接指向 `/` | 字符串上完全合法，必须用 `realpath` 解析真实路径才能发现       |

### 第 2 层：权限规则

三态 `allow | deny | ask`，规则按「最后匹配优先」（借鉴 opencode）。

默认规则集：

| 工具            | 资源模式                                       | 默认    |
| --------------- | ---------------------------------------------- | ------- |
| `read`          | `**`                                           | allow   |
| `read`          | `**/.env`、`**/.env.*`、`**/*.key`、`**/*.pem` | **ask** |
| `read`          | `**/.git/**`                                   | ask     |
| `write`         | `**`                                           | ask     |
| `edit`          | `**`                                           | ask     |
| `glob` / `grep` | `**`                                           | allow   |

即使是 read，密钥文件也要问——模型可能"好心"地把 `.env` 内容读出来展示在对话里，那就泄漏了。

同时提供两种模式预设（借鉴 opencode 的 build/plan agent）：

| 模式     | 行为                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| 只读模式 | 所有写操作 deny（工具仍暴露给模型，由权限层拒绝并立即收尾）。用于"分析代码"这类场景 |
| 编辑模式 | 写操作 ask。默认模式                                                                |

### 第 3 层：用户审批

审批 UI 是个卡片，显示：工具名、目标路径、**将要写入的内容 diff**。三个按钮：允许一次 / 本会话始终允许 / 拒绝。

「显示 diff」很重要。用户不该在看不到改什么的情况下点允许。写文件显示新增内容，编辑显示前后对比。

审批期间 Agent 循环阻塞。要处理超时（默认 5 分钟无响应视为拒绝）与页面刷新后的恢复（未决审批状态落库）。

## 工具集（第一批，数量受 04 约束）

按 `04` 测出的 `maxToolCount` 裁剪。2026-08-26 基线为 **6**（6 工具全指标 1.0；12 工具参数正确率 0.95）。按场景动态给，默认不超过 6 个：

| 工具    | 参数                             | 实现要点                                                                                                                          |
| ------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `read`  | `path`, `offset?`, `limit?`      | 分页读，单次上限 50KB / 2000 行。超限返回前 N 行 + 明确提示"内容已截断"                                                           |
| `write` | `path`, `content`                | 全量写。已存在则覆盖（审批时显示 diff）                                                                                           |
| `edit`  | `path`, `oldString`, `newString` | **精确字符串替换**。`oldString` 不唯一匹配时报错，让模型带更多上下文重试                                                          |
| `glob`  | `pattern`                        | 按文件名找。用 `tinyglobby`，不 shell 出去                                                                                        |
| `grep`  | `pattern`, `path?`               | 按内容搜。用 `@vscode/ripgrep@1.18.0` 自带的当前平台二进制，**用 `execFile` 传数组参数**执行，绝不依赖用户 PATH 或拼 shell 字符串 |

**不做 `bash` 工具。** 理由：2B 模型会乱用；命令注入风险最高；对"文件助手"这个场景不必要。列为明确的范围外。

`@vscode/ripgrep` 只安装当前平台/架构的预编译二进制，不在运行时下载。这里不使用约 60MB、包含全部平台二进制的 `@vscode/ripgrep-universal`；跨平台产物必须在对应平台构建，M5 打包时把该运行时依赖一并纳入产物并核对签名。

### 为什么 edit 用精确字符串替换而不是 diff/patch

opencode 的 `edit` 工具就是精确 `oldString → newString` 替换。对小模型来说这是最容易做对的形式：不需要生成合法的 diff 格式（行号、上下文行、@@ 标记，2B 模型几乎不可能生成正确的 unified diff），只需要复制粘贴一段原文再给出新内容。

`oldString` 不唯一时必须报错而不是替换第一个。报错信息要引导模型："找到 3 处匹配，请提供更多上下文使其唯一"。

## Agent 循环

```
run(sessionId):
  失败恢复：把上次中断的 dangling tool call 标记为 error

  while 有待处理输入:
    step = 1
    while 需要继续 且 step <= maxSteps:
      1. 从 durable inbox 提升输入为可见的 user message
      2. 组装上下文：系统提示 + 历史（按预算裁剪）
      3. 装配工具列表（按场景裁剪到 maxToolCount）
         若 step == maxSteps: toolChoice = 'none'   ← 强制收尾
      4. 调用模型（流式）
      5. 对每个 tool call：
           沙箱 → 权限 → 审批 → 执行 → 结果回填
           用户拒绝/审批超时 → 当前输入立即停止后续工具，确定性文本收尾
      6. 有 tool 执行过 → 需要继续 = true
      step++
```

### 四个必须做对的细节

| 细节                    | 做法                                                                         | 不做的后果                            |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| durable inbox           | 用户输入先写 `chat_inputs` 表，再触发执行                                    | 进程崩溃丢消息                        |
| maxSteps 强制收尾       | 最后一步禁用工具，逼模型产出文本回答                                         | 2B 模型可能无限循环调工具             |
| dangling tool call 恢复 | 启动时把 `running` 状态的 tool part 改为 `error`                             | 页面上永远转圈的工具卡片              |
| 单会话串行              | 同一会话同时只有一个执行流                                                   | 两个流并发写同一会话的消息，顺序错乱  |
| 拒绝是本轮终止边界      | 用户拒绝/超时/权限 deny 立即收尾；重复工具先纠正并继续，连续两轮全重复才硬停 | 误杀写入任务，或模型空转刷满 maxSteps |

### tool call 解析失败的兜底

即使走路线 A，也要处理模型没发 function call 而是输出了 JSON 代码块的情况（2B 模型会时不时这样）。解析顺序：

````
1. 标准 function call 字段     → 直接用
2. 消息里的 ```action / ```json 代码块  → 解析
3. 都失败 → 把「你的工具调用格式不正确，请用 function call 重试」回填，重试上限 2 次
4. 仍失败 → 放弃工具，让模型直接回答，并在 UI 上提示"模型未能正确调用工具"
````

第 4 步很重要：**失败要对用户可见**，不要静默地表现为"AI 答非所问"。

## 前端页面

复用 `07` 的对话页架构，差异在：

| 区域         | 内容                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| 顶栏         | 工作区目录选择器 + 模式切换（只读/编辑）                                          |
| 消息区       | 复用 part 渲染管道，`tool` part 渲染成工具调用卡片                                |
| 工具卡片     | 工具名 + 参数摘要 + 状态（pending/running/completed/error）+ 可展开看完整输入输出 |
| 审批弹窗     | 工具名、路径、内容 diff、三个按钮                                                 |
| 侧栏（可选） | 本次会话修改过的文件列表                                                          |

工作区目录的选择方式是平台差异（走 `packages/platform`）：Tauri 用原生目录选择对话框，Web 端让用户手输路径（并在服务端校验存在性）。

## 实施步骤

1. **确认 04 已完成**，读取工具调用测评结论，决定走路线 A 还是 B，记 ADR。
2. contracts 补 `agent/` 模块：工具 schema、权限规则、审批事件、工具状态机。
3. Drizzle 补 `chat_inputs`、`agent_permissions` 表（`chat_sessions`/`chat_messages` 已在 07 建好）。
4. 实现路径沙箱 + 单测（重点测 `..` 穿越与符号链接逃逸）。
5. 实现权限规则引擎 + 单测（规则优先级、通配匹配）。
6. 实现审批流程（SSE 事件、阻塞等待、超时、状态持久化）。
7. 实现统一 Tool 接口与注册表（schema 生成、参数校验、输出截断）。
8. 按顺序实现 5 个工具，每个都先写单测。
9. 实现 durable inbox（写入、提升、状态流转）。
10. 实现 Agent 循环（含 maxSteps、dangling 恢复、串行保证）。
11. 实现 tool call 解析与兜底重试。
12. 前端：工具调用卡片组件。
13. 前端：审批弹窗（含 diff 展示）。
14. 前端：工作区选择（走 platform 接口）。
15. 端到端手测：让 AI 读一个文件、改一个文件、生成一份 Markdown 文档。

## 验收标准（DoD）

### 功能

- [x] 让 AI 读取指定文件并总结内容，成功
- [x] 让 AI 在工作区创建一份 Markdown 文档，文件真的落盘且内容合理
- [x] 让 AI 修改某文件中的一行，`edit` 工具精确替换成功
- [x] 让 AI 找出工作区里的文件，`glob` 返回正确结果
- [x] 工具卡片状态正确流转 pending → running → completed

### 安全（每条都要实际试）

- [ ] 让 AI 读 `../../../etc/passwd`，被沙箱拒绝（单测覆盖；真实模型手测未单独记录）
- [ ] 在工作区放一个指向 `/` 的符号链接，让 AI 读它，被拒绝（单测覆盖；真实模型手测未单独记录）
- [x] 让 AI 读 `.env`，触发审批弹窗（不是直接读出来）
- [x] 让 AI 写文件，审批弹窗显示了将写入的内容
- [x] 审批点「拒绝」，工具返回错误，模型收到拒绝信息并能继续对话
- [x] 切到只读模式，让 AI 写文件，被 deny（不是弹审批）
- [x] `grep` 的 pattern 传 `; rm -rf /`，不发生命令注入（用 execFile 数组参数；二进制来自 `@vscode/ripgrep`）

### 健壮性

- [x] 执行中杀掉服务进程再重启，页面刷新后没有永久 running 的工具卡片（需配置 `DATABASE_URL` 走 Postgres；未配则内存仓重启即丢）
- [x] 让 AI 做一个需要 5+ 步的任务，到 maxSteps 时强制产出文本回答而不是继续循环（只读连刷 read 时观测到）
- [ ] 构造一个模型输出 JSON 代码块而非 function call 的情况，兜底解析生效（单测覆盖；真实模型未单独观测）
- [ ] 兜底也失败时，UI 上有明确提示，不是静默答非所问（单测覆盖；真实模型未单独观测）
- [ ] 读一个 10MB 的文件，返回被截断且有明确提示，不是内存爆掉（单测/实现有截断；真实 10MB 手测未单独记录）

## 验证命令

```bash
# 前置：确认 04 的基线报告存在
ls scripts/model-baseline/reports/

cd docker && docker compose up -d --wait && cd ..
pnpm db:migrate && pnpm dev:server & pnpm dev:web

# 准备一个测试工作区
mkdir -p /tmp/ai-engine-sandbox && cd /tmp/ai-engine-sandbox
echo "# 测试文档" > README.md
ln -s / escape-link           # 符号链接逃逸测试用

# 沙箱单测（重点）
pnpm test --filter liangzui-ai-server -- workspace-path
pnpm test --filter liangzui-ai-server -- permission
pnpm test --filter liangzui-ai-server -- agent-tools

# 直接测工具接口（绕过模型，验证沙箱）
curl -X POST http://localhost:3000/agent/tools/read/invoke \
  -H 'Content-Type: application/json' \
  -d '{"workspaceRoot":"/tmp/ai-engine-sandbox","path":"../../../etc/passwd"}'
# 期望：403 或明确的 PathEscapeError

curl -X POST http://localhost:3000/agent/tools/read/invoke \
  -H 'Content-Type: application/json' \
  -d '{"workspaceRoot":"/tmp/ai-engine-sandbox","path":"escape-link/etc/passwd"}'
# 期望：同样被拒绝

# Agent 对话（走真实模型）
curl -N -X POST http://localhost:3000/agent/<SESSION_ID>/stream \
  -H 'Content-Type: application/json' \
  -d '{"content":"读一下 README.md 并告诉我内容","workspaceRoot":"/tmp/ai-engine-sandbox"}'

# 检查 durable inbox
docker compose -f docker/docker-compose.yml exec postgres \
  psql -U ai_engine -d ai_engine \
  -c "SELECT id, status, delivery FROM chat_inputs ORDER BY created_at DESC LIMIT 5;"

# 检查没有 dangling tool call
docker compose -f docker/docker-compose.yml exec postgres \
  psql -U ai_engine -d ai_engine \
  -c "SELECT id FROM chat_messages WHERE parts::text LIKE '%\"state\":\"running\"%';"

# 清理
rm -rf /tmp/ai-engine-sandbox
```

## 风险与备选

| 风险                                                             | 处置                                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **04 结论是 tool call 不可用**                                   | 切路线 B（结构化输出驱动）。工程量相当，功能可用性更好                                         |
| 模型选错工具（该 read 却 write）                                 | 提示词里写死顺序约束；write/edit 默认 ask，用户是最后一道防线                                  |
| 模型生成的 `oldString` 与文件实际内容不完全一致（空格/换行差异） | 报错并告知模型实际内容片段，让它重试。**不要**做模糊匹配自动纠正——那会导致改错地方且用户不知道 |
| 审批弹窗太频繁，体验很差                                         | 提供「本会话始终允许」；只读操作默认放行；批量操作合并成一次审批                               |
| 每次工具结果回填导致上下文迅速耗尽                               | 工具输出必须截断（read 50KB、grep 前 50 条）；历史里的旧工具结果可以只保留摘要                 |
| 符号链接检查在文件不存在时报错                                   | 解析父目录的 realpath 而非目标本身（见上面代码）。这是实现时最容易写错的一行                   |
| Web 端让用户手输工作区路径，可能输入任意系统目录                 | 服务端配置一个允许的根目录白名单（默认用户家目录下的某个子目录），Web 端只能在白名单内选       |
