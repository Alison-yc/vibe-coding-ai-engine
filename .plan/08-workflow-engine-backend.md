# 08 · 工作流执行引擎（后端 · 微内核）

| 项       | 值              |
| -------- | --------------- |
| 阶段     | M3 · 工作流编排 |
| 依赖     | 03、04、05、06  |
| 预计工期 | 5～6 天         |
| 状态     | 已完成          |

## 技术选型

| 能力      | 方案                      | 说明                                                    |
| --------- | ------------------------- | ------------------------------------------------------- |
| 图调度    | 自建串行拓扑执行器        | 与 VariablePool、条件分支及 Drizzle 运行记录直接集成    |
| Code 沙箱 | `quickjs-emscripten`      | WASM 隔离；使用内存、栈、执行时间和输出大小限制         |
| HTTP 请求 | Node.js `http(s)` + `dns` | 仅允许公网 HTTP(S)，校验后固定连接 IP，重定向后重新解析 |

## 目标

实现一个**微内核插件化**的工作流执行引擎：内核只负责调度、变量传递、状态推送；每种节点是一个独立插件，新增节点不改内核一行代码。

"插件化微内核"是你在需求里明确提出的目标。它的验收标准很具体：**在内核代码里搜 `NodeType.LLM` 这类具体节点类型，应该搜不到任何 if/switch 分支。**

## 分层设计

```
Controller  (HTTP / SSE)
    │
    ▼
WorkflowService            业务编排：加载图、鉴权、创建运行记录
    │
    ▼
WorkflowEngine             ★ 内核：拓扑调度、循环检测、错误处理、事件发布
    │       │
    │       ├─→ VariablePool      运行期数据总线
    │       └─→ EventPublisher    SSE 事件
    ▼
NodeRegistry               NodeType → NodeRunner 的映射表
    │
    ▼
NodeRunner 实现（插件）      start / end / llm / knowledge-retrieval /
                            if-else / variable-assigner / code / http-request
    │
    ▼
基础设施：LlmGateway · VectorStore · Database
```

## 内核契约

### NodeRunner 接口（插件的唯一契约）

```ts
export interface NodeRunner<TConfig = unknown> {
  readonly type: NodeType;
  readonly configSchema: z.ZodType<TConfig>;

  run(
    config: TConfig,
    pool: VariablePoolReader, // 只读，防止节点乱改别人的变量
    ctx: NodeRunContext,
  ): Promise<NodeRunResult>;
}

export interface NodeRunResult {
  outputs: Record<string, unknown>; // 写入变量池，key 即输出变量名
  nextBranch?: string; // 条件节点用：走哪条出边
  usage?: TokenUsage; // 有模型调用的节点上报
}

export interface NodeRunContext {
  readonly runId: string;
  readonly nodeId: string;
  readonly signal: AbortSignal; // 支持中断
  emit(event: NodeStreamEvent): void; // 流式中间输出（LLM 节点用）
}
```

三个关键约束：

1. **节点只能通过 `pool` 读上游数据，不能拿到整张图。** 这从接口层面杜绝了节点之间的隐式耦合。
2. **`pool` 是只读的**，节点的产出通过返回值声明，由内核统一写入。这样内核能记录每个节点写了什么，调试和回放都有依据。
3. **必须接受 `signal`。** 用户点「停止运行」时，正在执行的 LLM 节点要能中断。

### VariablePool

运行期唯一的数据总线。

```ts
pool.get(['node_abc', 'text']); // ValueSelector 取值
pool.getSystem('query'); // 系统变量（用户输入、当前时间等）
pool.render('{{#node_abc.text#}}'); // 模板渲染
```

写入只有内核能做：`pool.set(nodeId, outputs)`。

系统变量用保留前缀（如 `sys`）隔离，防止与节点 id 冲突。

### 拓扑调度

第一阶段：**串行执行 + 拓扑排序**。

```
1. 从 start 节点出发，构建拓扑序
2. 检测循环 → 有环直接拒绝执行（返回具体的环路径）
3. 检测孤立节点、无出边的非 end 节点 → 警告
4. 按序执行，条件节点根据 nextBranch 裁剪后续路径
5. 每个节点前后发 SSE 事件
```

**不做并行执行。** 理由：Ollama 是单实例，两个 LLM 节点并行只会互相抢资源反而更慢；并行还会带来变量池的竞态问题。等有真实需求（比如多个 HTTP 节点确实该并行）再记 ADR 升级。

**不做**：循环节点（iteration/loop）、子工作流嵌套、人工介入暂停。这些是 Dify 有但对理解核心机制没有增量的复杂度。

### 为什么没有使用 LangGraph

完成 VariablePool 后按 ADR-D02 判据评估：LangGraph 的 state channel 与 checkpointer 会和 VariablePool、Drizzle 运行记录形成两套状态与持久化抽象。当前范围只有串行拓扑执行、条件分支和中断，不需要循环、并行或通用 checkpoint。

因此采用自建串行拓扑执行器。内核只依赖 `NodeRegistry` 和 `NodeRunner` 契约，不包含具体节点类型分支；未来确有循环或并行需求时再追加 ADR 升级。

## 第一批节点（8 个）

| 节点                  | 输入                         | 输出               | 实现要点                                       |
| --------------------- | ---------------------------- | ------------------ | ---------------------------------------------- |
| `start`               | —                            | 用户定义的入参字段 | 定义工作流的输入 schema，运行时校验实参        |
| `end`                 | ValueSelector 列表           | 工作流最终输出     | 从变量池取值组装                               |
| `llm`                 | 提示词模板（含变量引用）     | `text`             | 走 LlmGateway.stream，通过 `ctx.emit` 流式推送 |
| `knowledge-retrieval` | query 变量、知识库 id、topK  | `chunks`           | 复用 `06` 的检索服务                           |
| `if-else`             | 条件组（变量 + 操作符 + 值） | 分支决策           | **纯代码判断，不用 LLM**。原因见下             |
| `variable-assigner`   | 赋值列表                     | 新变量             | 常量、变量引用、模板拼接                       |
| `code`                | JS 代码片段、入参映射        | 代码返回值         | 沙箱执行，安全要求见下                         |
| `http-request`        | method/url/headers/body      | 响应状态与内容     | SSRF 防护必须做                                |

### if-else 为什么不用 LLM 判断

Dify 的条件节点也是纯代码判断。`04` 实测 Ollama JSON Schema 的 validRate 为 1.0，但用 LLM 做分支仍会让同一输入两次运行走不同路径，无法调试。**if-else 继续用代码。** 需要语义判断时：LLM 节点输出结构化结果，if-else 只读那个结果。

如果确实需要"语义判断"（比如"用户情绪是否负面"），做法是：用一个 LLM 节点输出结构化结果，再用 if-else 节点判断那个结果。**决策与判断分离**，这样 LLM 的不确定性被隔离在一个节点内。

### code 节点的沙箱

这是整个工作流引擎**最大的安全风险点**：执行用户提供的代码。

| 方案                    | 评估                                              |
| ----------------------- | ------------------------------------------------- |
| `eval` / `new Function` | 绝对不行。能访问全部 Node API，等于任意代码执行   |
| `vm` 模块               | Node 官方明确说明 `vm` **不是安全沙箱**，可以逃逸 |
| `isolated-vm`           | 真正的 V8 隔离。需要原生编译，安装可能有麻烦      |
| `quickjs-emscripten`    | WASM 里跑 QuickJS，天然隔离，无原生依赖           |
| 独立子进程 + 资源限制   | 可行但重                                          |

**决策**：用 `quickjs-emscripten`（WASM 沙箱）。理由：无原生编译依赖、隔离性由 WASM 边界保证、没有 fs/net/process 可访问。代价是不支持 Node API 和 npm 包——但 code 节点本来就应该只做纯数据变换，不该有 IO。

同时必须加：执行超时（默认 3 秒）、内存上限、输出大小上限、禁止 `while(true)` 类无限循环（靠超时兜住）。

这个决策要写进 `20` 的 ADR，因为它是有明确安全含义的技术选择。

### http-request 的 SSRF 防护

允许工作流发任意 HTTP 请求 = 允许探测内网。必须：

- 解析目标域名的 IP，拦截私有网段（127/8、10/8、172.16/12、192.168/16、169.254/16、::1），并将实际连接固定到已校验 IP，防止 DNS 重绑定
- 只允许 http/https 协议
- 跟随重定向后**重新校验**（这是最容易漏的一步）
- 超时与响应体大小上限
- 第一阶段可以更保守：域名白名单，默认只允许 localhost:11434（Ollama）之外的公网域名

## 运行态与 SSE

事件序列：

```
workflow_started    { runId, graphSnapshot }
node_started        { nodeId, inputs }
node_stream_chunk   { nodeId, text }        ← LLM 节点的流式输出
node_finished       { nodeId, outputs, elapsedMs, status }
node_failed         { nodeId, error }
workflow_finished   { outputs, totalElapsedMs, usage }
workflow_failed     { error, failedNodeId }
```

每个节点的运行记录落 `workflow_node_runs` 表，包含 inputs / outputs / 耗时 / 错误。这张表是「运行日志」面板的数据源，也是事后排查的唯一依据。

### 单节点调试

`POST /workflows/:id/nodes/:nodeId/run`：只跑一个节点，上游变量由前端手动填。

**这个功能对开发体验的价值超过它的实现成本。** 调试一个 LLM 节点的提示词时，不用每次从头跑整个工作流。Dify 有这个功能不是偶然。

## 实施步骤

1. contracts 补 `workflow/` 模块：NodeType 枚举、Graph DSL、ValueSelector、8 个节点的 config schema、运行态事件。
2. Drizzle 补 `workflows` / `workflow_runs` / `workflow_node_runs` 表并生成迁移。
3. 实现 `VariablePool`（取值、系统变量、模板渲染）+ 单测。
4. 实现图校验器：环检测、孤立节点、引用了不存在节点的变量、start/end 节点数量检查。**先做校验再做执行**，否则调试执行问题时分不清是图错了还是引擎错了。
5. 决策点：评估 LangGraph 是否适配，写 ADR，然后实现 `WorkflowEngine`（拓扑调度 + 事件发布 + 中断支持）。
6. 实现 `NodeRegistry`。
7. 按顺序实现 8 个节点：`start` → `end` → `variable-assigner` → `if-else` → `llm` → `knowledge-retrieval` → `http-request` → `code`。前四个不涉及外部依赖，可以先把引擎跑通。
8. 实现运行记录持久化。
9. 实现 SSE 接口与单节点调试接口。
10. 写「新增一个节点」的文档（放 `.cursor/rules/40` 已有 checklist，这里补一个实际例子）。

### 新增第 9 个节点示例

以新增 `text-transform` 节点为例：

1. 在 contracts 增加节点类型和 config schema，并补合法/非法契约用例。
2. 新建独立的 `TextTransformNodeRunner`，通过 `VariablePoolReader` 读取输入并返回 `outputs`。
3. 只在 `WorkflowModule` 的 `NodeRegistry` 工厂中注册 runner。
4. 补 runner 正常/失败用例，以及包含该节点的最小图测试。
5. `workflow/engine/` 不需要修改；若必须修改内核才能接入，说明节点契约或注册表设计需要先 Review。

## 验收标准（DoD）

- [x] 内核代码（engine / pool / registry）中搜不到任何具体 NodeType 的分支判断
- [x] 新增第 9 个节点时，只新建文件 + 注册，**engine 目录零改动**（注册表架构与单测已验证）
- [x] 有环的图提交执行，返回 400 并指出具体环路径，不是超时或栈溢出
- [x] 引用了不存在节点的变量，图校验阶段就报错
- [x] 一个 start → llm → end 的图能跑通，SSE 事件序列完整且含终止事件
- [x] if-else 节点的分支裁剪正确：未走的分支上的节点不执行
- [x] 运行中调用停止接口，正在执行的 LLM 节点被中断，运行记录状态为 `stopped`
- [x] code 节点执行 `while(true){}`，3 秒后超时终止，不拖死进程
- [x] code 节点执行 `require('fs')` 或 `process.exit()`，**必须失败**
- [x] http-request 节点请求 `http://127.0.0.1:5432`，**必须被拦截**
- [x] http-request 节点请求一个 302 重定向到内网地址的 URL，**必须被拦截**
- [x] 单节点调试能独立运行 llm 节点并返回结果
- [x] 每个 NodeRunner 至少有一个成功用例和一个失败用例的单测，且不依赖真实 Ollama

## 验证命令

```bash
# 前置
cd docker && docker compose up -d --wait && cd ..
pnpm db:migrate && pnpm dev:server

# 创建工作流（graph 内容见 .plan 附带的示例 JSON）
curl -X POST http://localhost:3000/workflows \
  -H 'Content-Type: application/json' \
  -d '{"name":"最小可运行流","graph":{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}}'

# 图校验（有环的图应返回 400）
curl -X POST http://localhost:3000/workflows/<ID>/validate \
  -H 'Content-Type: application/json' -d @<YOUR_PATH>/cyclic-graph.json

# 运行（SSE）
curl -N -X POST http://localhost:3000/workflows/<ID>/run \
  -H 'Content-Type: application/json' -d '{"inputs":{"query":"你好"}}'

# 单节点调试
curl -X POST http://localhost:3000/workflows/<ID>/nodes/<NODE_ID>/run \
  -H 'Content-Type: application/json' \
  -d '{"upstreamValues":{"node_abc":{"text":"测试输入"}}}'

# 安全验证：code 节点沙箱逃逸（应失败）
curl -X POST http://localhost:3000/workflows/<ID>/nodes/<CODE_NODE_ID>/run \
  -H 'Content-Type: application/json' \
  -d '{"upstreamValues":{},"configOverride":{"code":"return require(\"fs\").readdirSync(\"/\")"}}'

# 安全验证：SSRF（应被拦截）
curl -X POST http://localhost:3000/workflows/<ID>/nodes/<HTTP_NODE_ID>/run \
  -H 'Content-Type: application/json' \
  -d '{"upstreamValues":{},"configOverride":{"url":"http://127.0.0.1:5432"}}'

# 运行记录
docker compose -f docker/docker-compose.yml exec postgres \
  psql -U ai_engine -d ai_engine \
  -c "SELECT node_id, status, elapsed_ms FROM workflow_node_runs ORDER BY created_at;"

# 插件化验证：新增节点后 engine 目录应无改动
git diff --stat servers/liangzui-ai-server/src/workflow/engine/

# 单测
pnpm test --filter liangzui-ai-server -- workflow
```

## 风险与备选

| 风险                                                 | 处置                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| LangGraph 的抽象与变量池设计冲突                     | 步骤 5 的决策点。备选：自写串行拓扑执行器（<200 行），可控性更高。**不要**为了"用上 LangGraph"而扭曲架构            |
| `quickjs-emscripten` 集成有坑（WASM 加载、类型定义） | 备选降级：code 节点第一版只支持受限的表达式求值（如 `expr-eval` 库），不支持完整 JS。功能弱但安全，且能先把引擎跑通 |
| 2B 模型在多节点串联时质量累积衰减                    | 这是模型限制。设计上让每个 LLM 节点任务尽量单一，不要指望一个节点做复杂多步推理                                     |
| 运行记录表膨胀                                       | 加保留策略：只保留最近 N 次运行的详细记录。第一阶段不做，记为 TODO                                                  |
| 节点执行失败后整个工作流中断，用户不知道哪里错了     | `node_failed` 事件必须带节点 id 和可读错误；画布上对应节点标红。这是 `09` 的验收项                                  |
