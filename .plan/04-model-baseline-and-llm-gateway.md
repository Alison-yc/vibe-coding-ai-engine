# 04 · 本地模型能力基线测评与 LLM 网关

| 项       | 值                            |
| -------- | ----------------------------- |
| 阶段     | M1 · 模型能力与数据层         |
| 依赖     | 02、03                        |
| 预计工期 | 3 天（测评 2 天 + 网关 1 天） |
| 状态     | 已完成                        |

## 为什么这是整个项目的关键路径

你的模型是 **2B 参数级别**。云端 GPT/Claude 能稳定做到的事情，qwen3.5:2b 大概率做不到，但具体在哪一步崩、崩得多厉害，**不实测就不知道**。

如果跳过这一步直接开工 Agent 页面，最可能的结局是：花两周实现了 12 个工具的 Agent 循环，然后发现模型连"选对该用哪个工具"都做不到，整个功能设计推翻重来。

这个 plan 的产出物是一份**实测报告**，后续三个 plan 都要引用它的数字：

| 产出的数字                         | 被谁引用   | 影响什么                                                 |
| ---------------------------------- | ---------- | -------------------------------------------------------- |
| 同时挂 N 个工具时 tool call 正确率 | `10`       | Agent 能挂几个工具                                       |
| 有效上下文长度（不是标称值）       | `06`       | RAG 能塞几个检索片段                                     |
| 结构化输出（JSON）成功率           | `08`、`10` | 条件判断节点能否让模型做决策；tool call 兜底方案是否必要 |
| 首 token 延迟与吞吐                | `07`       | 是否需要加载状态骨架、超时阈值设多少                     |
| 中文指令遵循能力                   | 全部       | 提示词要写多严格                                         |

## 前置条件

```bash
ollama list          # 确认三个模型都在
curl -s http://127.0.0.1:11434/api/version
```

## 第一部分：基线测评

### 测评脚本位置

`scripts/model-baseline/`，用 TS 写，通过 `pnpm baseline` 执行。**这是工程脚本，不是业务代码**，不被 `src` 引用，但要纳入 lint 与 typecheck。

```
scripts/model-baseline/
├── index.ts                 # CLI 入口，选择测评项与模型
├── cases/
│   ├── instruction.ts       # 指令遵循
│   ├── tool-call.ts         # 工具调用（核心）
│   ├── structured.ts        # 结构化输出
│   ├── context.ts           # 有效上下文长度
│   ├── latency.ts           # 延迟与吞吐
│   └── embedding.ts         # 中文语义检索质量
├── runner.ts                # 执行、重复采样、统计
└── report.ts                # 输出 Markdown 报告
```

### 六项测评的具体设计

**1. 指令遵循（instruction）**
20 条中文指令，每条要求明确的输出格式约束（"只输出翻译结果，不要解释"、"用不超过 10 个字回答"、"输出 JSON，不要 markdown 代码块")。每条跑 5 次，统计格式合规率。

关注点：2B 模型最常见的失败是**多嘴**——在要求的输出前后加"好的，以下是..."。测出这个比例，决定提示词要不要加更强的约束或后处理裁剪。

**2. 工具调用（tool-call）★ 最重要**

阶梯式测试，找出可用工具数量的拐点：

| 场景 | 挂载工具数                      | 测什么                               |
| ---- | ------------------------------- | ------------------------------------ |
| A    | 1 个                            | 最基本能力，能不能发出合法 tool call |
| B    | 3 个                            | 能不能在少量候选中选对               |
| C    | 6 个                            | 选择正确率开始下降多少               |
| D    | 12 个                           | 是否完全不可用                       |
| E    | 3 个 + 需要连续两次调用         | 多轮工具编排能力                     |
| F    | 3 个 + 参数嵌套对象             | schema 复杂度的影响                  |
| G    | 3 个 + 明确的不该调用工具的问题 | 会不会滥用工具（假阳性）             |

每个场景 20 个用例 × 3 次采样。统计四个指标：合法 JSON 率、工具选择正确率、参数正确率、假阳性率。

**这七个场景的结果直接写入 `10` 的工具数量上限。**

**3. 结构化输出（structured）**
测三种方式在 2B 模型上的成功率：Ollama 的 `format: 'json'` 参数、提示词要求 JSON、提示词要求 JSON 且给 few-shot 示例。同时测 schema 复杂度的影响（3 字段 / 8 字段 / 带数组 / 带嵌套）。

这决定工作流的"条件判断"节点能不能让模型输出结构化决策，以及 `10` 的 tool call 兜底方案怎么做。

**4. 有效上下文长度（context）**
标称的 context window 和实际能用的长度往往差很远。做"大海捞针"测试：在长度递增的中文文本（2k / 4k / 8k / 16k / 32k token）中插入一条特定事实，问模型这条事实，看在什么长度、什么位置开始召回失败。

同时测：超长输入时是否报错、是否静默截断、延迟如何增长。

**现有代码里 `numCtx: 2048` 和 `numPredict: 128` 是拍脑袋定的值，这一项测完后必须用实测的合理值替换。** 2048 的上下文在 RAG 场景下塞不进几个检索片段，128 的输出上限会把回答截断在半句话——这两个参数正是"看起来像模型笨"的常见误判来源。

**5. 延迟与吞吐（latency）**
测冷启动（模型未加载）与热启动的首 token 延迟、token/s 吞吐、`keepAlive` 的实际效果、两个 LLM 模型并发时的表现。gemma4:e2b 是 7.2GB，加载时间要单独记。

**6. Embedding 质量（embedding）**
构造 50 条中文问答对，测 nomic-embed-text 的检索质量：Recall@1 / Recall@3 / MRR。加入难例（语义相近但答案不同的干扰项）。

同时对比三种切分策略（固定 512 字符 / 按段落 / 按语义边界）对检索质量的影响，结果直接给 `06` 用。

### 报告产出

`scripts/model-baseline/reports/YYYY-MM-DD-baseline.md`，**提交进仓库**。这份报告本身就是简历上的加分项——它证明你不是盲调 API，而是对模型能力有量化认知。

报告必须包含：环境信息（模型版本、机器配置）、每项的原始数据表、结论段落（"因此本项目决定 ..."）。

## 第二部分：LLM 网关

### 技术选型增量

- `@nestjs/config`：按服务端规范集中注入 Ollama 配置，禁止业务代码直接读取 `process.env`。
- `zod`：启动时校验配置和 Ollama HTTP 响应；服务端直接依赖，不借用 contracts 的传递依赖。
- Ollama 网关使用原生 `fetch`，不新增 HTTP 客户端；LangChain 仅保留现有内存向量存储适配。

### 目标

把模型调用收敛到一个抽象层，业务代码不直接碰 LangChain 或 Ollama SDK。

### 接口设计

```ts
export interface LlmGateway {
  chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  stream(req: ChatRequest, signal?: AbortSignal): AsyncIterable<LlmStreamEvent>;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  countTokens(text: string): Promise<number>;
  capabilities(modelId: ModelId): ModelCapabilities; // 来自基线报告的实测数据
}
```

`capabilities()` 是这个设计的关键。它把基线测评的结论**变成代码里可查询的数据**，而不是躺在文档里的文字：

```ts
{
  maxToolCount: 3,             // 来自测评场景 B/C 的拐点
  effectiveContextTokens: 8192,// 来自大海捞针实测
  supportsJsonMode: true,
  needsToolCallFallback: true, // 来自 tool call 合法率
}
```

Agent 循环在装配工具列表时读 `maxToolCount` 做裁剪；RAG 在拼上下文时读 `effectiveContextTokens` 做截断。**功能自动适配模型能力，而不是靠人记住。**

### 实现要点

| 要点           | 做法                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| 依赖注入       | `@Injectable()` + `useClass`，测试可替换成 `FakeLlmGateway`                                                       |
| 禁止模块级单例 | 现有 `translate.ts` 在模块顶层 `createChatOllama()`，重构掉                                                       |
| 取消传播       | `AbortSignal` 一路传到 fetch，客户端断开立刻停止占用 Ollama                                                       |
| 超时           | 分层设置：embed 30s、chat 非流式 120s、stream 的**首 token** 30s（不是整体超时）                                  |
| 重试           | 只对连接错误重试（Ollama 未启动/模型加载中），不对内容错误重试。指数退避，上限 2 次                               |
| 错误分类       | `OllamaUnreachableError` / `ModelNotFoundError` / `ContextOverflowError` / `TimeoutError`，每种带可操作的排查提示 |
| 观测           | 每次调用记录模型、token 数、耗时、是否命中缓存，供 `18` 使用                                                      |
| 参数来源       | `numCtx` / `numPredict` / `temperature` 从配置读，默认值取自基线报告，不硬编码                                    |

### provider 抽象保留到什么程度

只实现 Ollama，但接口不暴露 Ollama 特有概念（不出现 `keepAlive`、`numCtx` 这类字段在 `ChatRequest` 里，它们属于配置而非请求）。这样将来接免费在线模型时只需加一个实现类。

**不做**：多 provider 路由、fallback 链、负载均衡。这些在只有一个本地 provider 时是纯粹的过度设计。

## 实施步骤

1. 建 `scripts/model-baseline` 骨架与 runner（支持重复采样、并发控制、中断续跑）。
2. 依次实现六项测评，每完成一项就跑一次看数据是否合理。
3. 生成首份报告，提交仓库。
4. 根据报告结论确定网关的默认参数（重点：`numCtx`、`numPredict`、超时值、`maxToolCount`）。
5. 实现 `LlmGateway` 接口与 `OllamaLlmGateway`。
6. 实现 `FakeLlmGateway`（测试用，可编程返回值与调用记录）。
7. 用网关重构现有的 `translate.ts` 与 `rag.ts` 的模型调用部分，删掉模块级单例。
8. 补单测：网关的错误分类、超时、取消、重试逻辑（全部用 fake HTTP，不连真 Ollama）。

## 验收标准（DoD）

- [x] `pnpm baseline` 能一键跑完六项测评并生成报告
- [x] 报告已提交，包含明确的"因此本项目决定 ..."结论段
- [x] `capabilities()` 返回的数值有报告出处，能在报告里查到对应的表格
- [x] `numCtx` 与 `numPredict` 已替换为实测值，且写明依据
- [x] 业务代码中不再出现 `new ChatOllama` / `new OllamaEmbeddings` 直接调用
- [x] 关掉 Ollama 后调用接口，返回的错误信息包含"检查 Ollama 是否在 :11434 运行"
- [x] 请求进行中断开客户端，服务端日志显示请求已取消（不是继续跑完）
- [x] 网关单测覆盖率 ≥ 85%，且不依赖真实 Ollama

## 验证命令

```bash
# 环境确认
ollama list
curl -s http://127.0.0.1:11434/api/version

# 全量测评（耗时较长，建议后台跑）
pnpm baseline

# 单项测评
pnpm baseline --case tool-call --model qwen3.5:2b --samples 3
pnpm baseline --case context --model qwen3.5:2b
pnpm baseline --case embedding

# 网关单测（不需要 Ollama）
pnpm test --filter liangzui-ai-server -- llm-gateway

# 取消传播验证：发起流式请求后 2 秒 Ctrl-C，观察服务端日志
curl -N -X POST http://localhost:3000/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"<UUID>","content":"写一篇 500 字的散文"}'

# 错误提示验证（先 ollama stop 或改错端口）
curl -X POST http://localhost:3000/llm/translate \
  -H 'Content-Type: application/json' -d '{"text":"你好"}'
```

## 风险与备选

| 风险                                        | 处置                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 测评发现 qwen3.5:2b 的 tool call 完全不可用 | 备选路径：Agent 页改为"结构化输出驱动"——让模型输出固定格式的 JSON 指令块，服务端解析后执行。这是降级但仍可用的方案，且更能体现工程能力。此时 `10` 需要重写 |
| 有效上下文远低于预期（如只有 4k）           | RAG 检索片段数降到 2～3 条，加强 rerank 与片段压缩；`06` 里的 chunk size 相应调小                                                                          |
| gemma4:e2b 加载太慢影响体验                 | 不做默认模型，仅在"复杂任务"场景由用户显式选择，并在 UI 上提示首次加载耗时                                                                                 |
| 测评脚本自身有 bug 导致结论错误             | 每项测评先用一个"必然成功"和一个"必然失败"的用例自校验；报告里附原始响应样本供人工抽查                                                                     |
| 基线数据随 Ollama/模型更新过期              | 报告文件名带日期，`capabilities()` 里注明数据来源版本。模型升级后重跑并新增报告，不覆盖旧的                                                                |
