# AGENTS.md

给 AI 编码助手（Cursor / Claude Code / Copilot 等）的项目指令。

细分规则在 `.cursor/rules/`，本文是入口与最高优先级约定。`.cursor/rules/` 里的内容与本文冲突时，以更具体的那份为准。

## 先读什么

动手前必须确认三件事，否则大概率写出与既有设计冲突的代码：

1. **本次任务对应 `.plan/` 里的哪一份、哪一条实施步骤。** `.plan/` 是唯一权威计划源，不是参考资料。
2. **相关的 `.cursor/rules/`。** 按目录匹配：改 React 看 `20`，改 NestJS 看 `30`，改工作流节点看 `40`，改 Agent 工具看 `50`，改 Rust 看 `60`。安全相关（`80`）无条件适用。
3. **`.plan/20-adr-and-risks.md` 里有没有相关 ADR。** 已决策的事不要重新提议。

## 本项目最容易出错的五件事

按实际踩坑概率排序。这些不是风格偏好，是会导致返工的问题。

### 1. 按云端大模型的能力假设写代码

本地只有 **qwen3.5:2b**。它不是 GPT-4，也不是 qwen-max。具体差异：

- 工具调用会漏参数、造不存在的工具名、在不该调用时调用
- 复杂 JSON 结构（嵌套、多字段）经常格式错误
- 长上下文（>8k）后段信息容易丢失
- 多步推理链条超过 3 步就开始跑偏

**因此：**任何一次模型调用都必须假设它可能返回垃圾。JSON 输出必须用 zod 校验 + 失败重试 + 兜底路径，三者缺一不可。给模型的工具数量控制在 5 个以内。多步任务拆成多次单步调用，而不是指望一次输出完整计划。

真实能力边界以 `.plan/04` 的实测报告为准，不要凭印象假设。**基线测评没跑完之前，不要写依赖工具调用可靠性的功能。**

### 2. 破坏分层，尤其是 `app-core` 的端无关性

```
packages/contracts   ← 谁都能依赖，它不依赖任何人
packages/platform    ← 只定义接口 + web/tauri 两套实现
packages/app-core    ← 业务功能。只依赖 contracts + platform 的接口
clients/ frontend/   ← 薄壳，负责注入 platform 实现 + 路由
servers/             ← NestJS，只依赖 contracts
```

**`packages/app-core` 里出现 `@tauri-apps/*` 的 import，或者 `window` / `localStorage` 的直接访问，就是错的。** 一旦出现，Web 端立刻构建失败或运行时报错，而且往往到打包时才发现。需要平台能力就在 `packages/platform` 的接口上加方法，然后实现两次。

ESLint 的 `no-restricted-imports` 会拦这类错误。**如果你发现自己想加 eslint-disable 来绕过架构护栏，那说明设计需要调整，不是护栏需要绕过。**

### 3. 跨进程数据结构定义两遍

前后端共享的任何数据结构——API 请求响应、SSE 事件、工作流定义、Agent 工具参数——只在 `packages/contracts` 用 zod 定义一次，TS 类型用 `z.infer` 导出。

```ts
// ✅ contracts 里定义一次
export const chatRequestSchema = z.object({ ... });
export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ❌ 不要在前端和后端各写一个 interface
```

手写重复的 `interface` 会在改动时静默不同步，编译期发现不了，跑起来才炸。

### 4. 安全边界靠"看起来没问题"来保证

这三处每一处都能导致真实危害，不是理论风险：

- **Agent 文件路径**：必须经 `resolveWorkspacePath()`。它用 `fs.realpath` 解析后再比较，因为仅 `startsWith` 检查挡不住工作区内的符号链接逃逸。
- **工作流 code 节点**：必须用 WASM 沙箱（quickjs-emscripten）。Node 官方明确说明 `vm` 模块不是安全沙箱。
- **模型输出渲染**：`react-markdown` 默认禁用原始 HTML，不要加 `rehype-raw`，不要用 `dangerouslySetInnerHTML`。

完整红线见 `.cursor/rules/80-security.mdc`。写到这三处附近时**同一个 PR 里就要补上对应的安全测试用例**，别留到"之后统一补"。

### 5. 写出永远不会失败的测试

模型输出不确定，所以不能断言"输出等于某个字符串"。但也不能因此把断言写成永真式。

```ts
// ❌ 这个断言永远通过，等于没测
expect(result).toBeDefined();

// ✅ 断言结构与不变量
expect(chatResponseSchema.safeParse(result).success).toBe(true);
expect(result.citations.every((c) => c.docId in knownDocs)).toBe(true);
```

业务逻辑测试用 `FakeLlmGateway` 注入固定输出，把不确定性隔离掉。真实模型只在 `pnpm baseline` 和 `pnpm rag-eval` 里调用，那两个是评测不是测试，不进 CI。

**自检方式：把实现改坏，测试必须变红。** 不会变红的测试要删掉重写。

## 修改代码时

- **改之前先读**。这个仓库有既定模式（工作流节点的三层注册表、Agent 的统一 Tool 接口、SSE 事件格式），照抄邻近文件的写法比自己发明一套更好。
- **小步改**。一个 PR 一件事。不要顺手重构无关代码，也不要顺手升级依赖。
- **不要留 TODO 占位实现**。要么完整实现，要么明确告诉用户这块没做以及为什么。返回假数据的空函数是最坏的选择——它看起来能跑。
- **不确定就问，不要猜**。特别是涉及模型能力边界、端口配置、既有代码意图的时候。无法从代码确认的信息，明确说"当前信息无法确认"。

## 提交前

```bash
pnpm ci:local    # format:check + lint + typecheck + test:cov + sec:sast + build
```

提交信息用 conventional commits，scope 取值见 `commitlint.config.js`：

```
feat(rag): 支持 PDF 文档分块索引
fix(workflow): 修正条件节点在空数组上的分支判断
```

不要在提交信息里写"AI 生成"之类的元信息，也不要在代码注释里解释"这次改了什么"——那是给 reviewer 看的，合并后就是噪音。

## 注释

只写代码本身表达不了的信息：约束、权衡、非直觉的原因。

```ts
// ✅ numCtx 设 4096 而非更大：M 系列 16G 内存下 8192 会触发 swap，
//    首 token 延迟从 1.2s 涨到 6s+。实测数据见 .plan/04。
const numCtx = 4096;

// ❌ 设置上下文长度
const numCtx = 4096;
```

不要写"这里做了什么"、"这个改动是为了修复 xxx"、"根据某个 plan 的要求"。

## 不要做的事

- 不要创建计划外的 `.md` 文档。`.plan/` 已经有 22 份，不需要更多总结文件。
- 不要动 `.plan/` 和 `.cursor/rules/` 里的内容，除非用户明确要求。
- 不要执行改变环境状态的命令（安装、迁移、删除、`git push`）而不先说明。
- 不要硬编码模型名、端口、Ollama 地址。全部走配置。
- 不要引入新依赖而不说明理由和体积影响。
