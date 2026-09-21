# 03 · 共享契约层 `@ai-engine/contracts`

| 项       | 值                         |
| -------- | -------------------------- |
| 阶段     | M0 · 工程底座              |
| 依赖     | 02                         |
| 预计工期 | 2 天（后续随功能增量扩展） |
| 状态     | 已完成（CR-02）            |

## 目标

建立**前后端唯一的类型来源**。所有跨进程的数据结构先在这里用 zod 定义，前端 import 派生类型，后端 import 同一份 schema 做运行时校验。

这是全栈项目最容易腐化的地方：接口字段改了，前端不知道，直到线上白屏。契约层用编译期错误代替线上事故。

**非目标**：这个包不含任何业务逻辑、不含运行时副作用、不依赖 NestJS 或 React。它只有 zod 一个 runtime 依赖。

## 为什么用 zod 而不是别的方案

| 方案                        | 为什么不选                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| 手写 `interface` 放共享包   | 没有运行时校验。后端仍要写一遍 DTO，两边会漂移                                                         |
| OpenAPI → 代码生成          | Dify 和 opencode 都这么做，但生成链路要维护（生成时机、产物入库、CI 校验一致性）。单人项目投入产出比低 |
| tRPC                        | 类型体验最好，但它假设前后端都是 TS 且共享类型推导。NestJS 里接 tRPC 会与 Nest 的模块/DI/守卫体系打架  |
| **zod schema 共享**（选中） | 一份定义同时得到编译期类型（`z.infer`）和运行时校验（`.parse`）。无代码生成、无构建步骤、无框架绑定    |

zod 版本用 4.x（npm 当前 `4.4.3`）。注意 zod 4 相对 3 有 API 变化，写代码时以 4 的文档为准。

## 包结构

```
packages/contracts/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                    # 唯一出口，re-export 全部
    ├── common/
    │   ├── primitives.ts           # Id、Timestamp、Pagination、分页响应包装
    │   └── errors.ts               # 统一错误响应结构与错误码枚举
    ├── llm/
    │   ├── model.ts                # ModelId、模型能力描述、生成参数
    │   └── stream-event.ts         # LLM 层流式事件
    ├── chat/
    │   ├── session.ts              # 会话
    │   ├── message.ts              # 消息与 part 联合类型
    │   └── api.ts                  # 请求/响应/SSE 事件
    ├── knowledge/
    │   ├── dataset.ts              # 知识库
    │   ├── document.ts             # 文档与切片
    │   ├── retrieval.ts            # 检索参数与结果
    │   └── api.ts
    ├── workflow/
    │   ├── node-type.ts            # ★ NodeType 枚举（微内核的注册键）
    │   ├── graph.ts                # ★ 图 DSL：{ nodes, edges, viewport }
    │   ├── value-selector.ts       # ★ 变量引用
    │   ├── nodes/                  # 每种节点的 config schema
    │   │   ├── start.ts  end.ts  llm.ts  knowledge-retrieval.ts
    │   │   └── if-else.ts  variable-assigner.ts  code.ts  http-request.ts
    │   ├── run-event.ts            # 运行态 SSE 事件
    │   └── api.ts
    └── agent/
        ├── tool.ts                 # 工具 schema 与结果
        ├── permission.ts           # 权限三态与规则
        └── api.ts
```

## 核心 schema 设计

### 消息 part 联合类型（统一对话与工具轮次共用）

借鉴 opencode 的分块建模。一条 assistant 消息不是一个字符串，而是一串 part：

```ts
export const MessagePartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), id: z.string(), text: z.string() }),
  z.object({ type: z.literal('reasoning'), id: z.string(), text: z.string() }),
  z.object({
    type: z.literal('tool'),
    id: z.string(),
    name: z.string(),
    state: z.enum(['pending', 'running', 'completed', 'error']),
    input: z.unknown().optional(),
    output: z.string().optional(),
    error: z.string().optional(),
  }),
  z.object({ type: z.literal('citation'), id: z.string(), chunks: z.array(CitationChunkSchema) }),
]);
```

这个设计让"工具调用卡片"、"思考过程折叠"、"引用溯源"三种 UI 都落在同一套渲染管道里，不需要为每种情况开分支解析。

统一对话改造后，`ChatStreamRequest` 还承担请求级能力边界：`fileAccess` 默认关闭；只有开启时才允许携带 `workspaceRoot` 与只读/编辑模式。Chat SSE 事件联合类型同时覆盖文本增量、引用、工具状态、审批和 warning，前后端不得再手写第二套近似事件。

### 工作流图 DSL

```ts
export const GraphSchema = z.object({
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
});
```

节点结构上，React Flow 需要的字段（`id` / `position`）在顶层，业务配置在 `data` 里，`data.type` 才是业务节点类型。运行态字段以 `_` 前缀标记且**不进持久化 schema**——这个区分要在 schema 层面就做出来，不要靠自觉。

```ts
export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.literal('custom-node'), // React Flow 层固定值
  position: z.object({ x: z.number(), y: z.number() }),
  data: NodeDataSchema, // data.type 是 NodeType
});
```

### 变量选择器

```ts
export const ValueSelectorSchema = z.array(z.string()).min(2); // [nodeId, ...path]
```

配套两个纯函数（也放这个包，因为前后端都要用）：

- `toTemplate(selector)` → `{{#nodeId.field#}}`
- `parseTemplate(text)` → `ValueSelector[]`（提取模板里引用的所有变量，用于校验引用的节点是否存在）

### SSE 事件

每个模块的事件都用 discriminated union，`event` 字段作判别键。契约包同时导出一个类型安全的事件名常量表，前后端都从这里取，避免拼错字符串。

**必须包含终止事件。** 每个 SSE 流都要有 `done` 或 `error` 收尾，前端不能靠连接断开推断结束——那样区分不了"正常结束"和"网络断了"。

### 向量维度常量

```ts
export const EMBEDDING_DIMENSION = 768; // nomic-embed-text
```

数据库迁移、向量检索、类型定义全部引用这一个常量。换 embedding 模型时只改这里，其余地方编译期报错提示你该改哪。

## 实施步骤

1. 建包，`package.json` 只依赖 `zod`，`exports` 字段配好子路径导出（`@ai-engine/contracts/workflow` 这类细粒度导入，避免全量打包）。
2. 先写 `common/` 与 `llm/`，这两个是其他模块的地基。
3. 写 `chat/`，然后立刻用它重构现有的 `app.controller.ts`：把 `GET /translate?text=` 改成 `POST /llm/translate` + zod 校验。**这一步很关键**——它验证契约层真的能用，而不是写完就摆着。
4. 服务端接入 `nestjs-zod`（或自写 20 行的 `ZodValidationPipe`），全局启用。
5. 前端封一层 `apiClient`，请求前用 schema `parse` 响应。开发环境校验失败直接抛错，生产环境降级为告警。
6. 写契约测试：每个 schema 至少测一个合法样例、一个非法样例、一个边界样例。
7. 其余模块（`knowledge` / `workflow` / `agent`）随对应功能 plan 增量补充，不在这个阶段一次写完。

## 验收标准（DoD）

- [x] `packages/contracts` 的 `dependencies` 只有 `zod`
- [x] `pnpm build --filter @ai-engine/contracts` 产出 `.d.ts`
- [x] 现有 translate 接口已改为 POST + 契约校验，前后端都从 contracts 取类型
- [x] 故意给 translate 接口传 `{ text: 123 }`，返回 400 且错误体符合 `common/errors.ts` 的结构
- [x] 故意在 contracts 里给 `ChatRequestSchema` 加一个必填字段，前端调用处 `pnpm typecheck` **必须报错**
- [x] 契约测试覆盖率 ≥ 90%（这个包全是纯函数和 schema，达标不难，也最该达标）

## 验证命令

```bash
pnpm build --filter @ai-engine/contracts
pnpm test --filter @ai-engine/contracts
pnpm test:cov --filter @ai-engine/contracts

# 契约生效验证（服务端需先启动）
curl -X POST http://localhost:3000/llm/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"你好"}'

# 应返回 400 且错误结构符合约定
curl -i -X POST http://localhost:3000/llm/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":123}'

# 依赖洁癖检查：不应出现 react / @nestjs / express
pnpm why --filter @ai-engine/contracts react
```

## 风险与备选

| 风险                                        | 处置                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| zod 4 与 `nestjs-zod` 的兼容性未经验证      | 先写 20 行自研 `ZodValidationPipe`（`schema.safeParse` + 抛 `BadRequestException`），零依赖零风险。确认 `nestjs-zod@5` 支持 zod 4 后再替换 |
| schema 越写越大，前端全量引入导致包体积膨胀 | `exports` 配子路径导出 + 按需 import；用 `knip` 检测未使用导出                                                                             |
| 前端每次响应都 parse 带来性能开销           | 只在开发环境做完整 parse，生产环境对高频接口（如 SSE 每个 chunk）跳过校验                                                                  |
| 契约与数据库 schema 出现两套定义            | 明确分工：contracts 是**对外**契约，Drizzle schema 是**存储**结构，两者故意不复用（存储字段不该泄漏到 API）。转换在 Service 层显式做       |
