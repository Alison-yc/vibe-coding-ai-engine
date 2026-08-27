# 07 · AI 对话助手页

| 项       | 值                 |
| -------- | ------------------ |
| 阶段     | M2 · RAG 与对话    |
| 依赖     | 03、04、05、06、14 |
| 预计工期 | 4～5 天            |
| 状态     | 进行中             |

## 技术选型

| 包                    | 版本 | 用途                                      |
| --------------------- | ---- | ----------------------------------------- |
| zustand               | 5.x  | 流式 message parts 的 event reducer store |
| @tanstack/react-query | 5.x  | 会话列表与历史消息缓存                    |
| react-markdown        | 10.x | 模型输出 Markdown；默认禁用原始 HTML      |
| remark-gfm            | 4.x  | GFM 表格/任务列表                         |
| rehype-highlight      | 7.x  | 代码高亮；禁止配 `rehype-raw`             |

## 目标

做出一个体感接近豆包/千问的对话页：左侧会话列表，右侧对话区，流式输出，支持挂载知识库问答与引用溯源。

**这个页面的 SSE 链路是后面工作流运行态和 Agent 页的共用基础设施**，所以要一次做扎实，不要图快。

## 界面结构

```
┌──────────────┬────────────────────────────────────────────┐
│  会话侧边栏   │  顶栏：会话标题 · 模型选择 · 知识库挂载       │
│              ├────────────────────────────────────────────┤
│  + 新建会话   │                                            │
│              │   消息时间线                                │
│  ○ 会话 A     │   ┌────────────────────────────────┐      │
│  ● 会话 B     │   │ user: 问题                      │      │
│  ○ 会话 C     │   └────────────────────────────────┘      │
│              │   ┌────────────────────────────────┐      │
│  ...         │   │ assistant                       │      │
│              │   │  ▸ 思考过程（可折叠）            │      │
│  ──────────  │   │  Markdown 正文（流式）           │      │
│  设置        │   │  [1] [2] 引用角标                │      │
│  主题切换     │   └────────────────────────────────┘      │
│              ├────────────────────────────────────────────┤
│              │  输入区：多行输入 · 停止生成 · 发送          │
└──────────────┴────────────────────────────────────────────┘
```

## 前端架构

### 消息渲染管道

一条 assistant 消息是 `MessagePart[]`（契约层定义），不是一个字符串。渲染时遍历 parts，按 `type` 分发到不同组件：

| part type   | 组件            | 说明                        |
| ----------- | --------------- | --------------------------- |
| `text`      | Markdown 渲染器 | 流式增量更新                |
| `reasoning` | 可折叠块        | qwen3 系列的 think 模式产物 |
| `tool`      | 工具调用卡片    | Agent 页会用，对话页预留    |
| `citation`  | 引用列表        | 点击定位到知识库原文        |

这个设计让对话页和 Agent 页共用同一套渲染管道，不需要各写一套。

### 状态管理

| 状态                 | 方案                                 |
| -------------------- | ------------------------------------ |
| 会话列表、历史消息   | TanStack Query（有缓存、有失效策略） |
| 当前流式消息的 parts | zustand + event reducer              |
| 输入框内容、折叠状态 | 组件本地 `useState`                  |
| 当前会话 id          | 路由参数（可分享、可刷新恢复）       |

**流式消息不放 TanStack Query。** Query 的心智模型是"请求-响应-缓存"，硬塞流式增量会很别扭。分工：流式进行中由 zustand 持有，`done` 事件后把完整消息写回 Query 缓存。

### event reducer

```ts
// SSE 事件 → store 更新，组件只订阅
function applyEvent(state: ChatState, event: ChatStreamEvent): ChatState {
  switch (event.event) {
    case 'message.start': // 创建空的 assistant 消息
    case 'message.part.start': // 新增一个 part
    case 'message.part.delta': // 按 partId 追加内容 ★ 高频
    case 'message.part.end':
    case 'message.citations':
    case 'done': // 收尾，落 Query 缓存
    case 'error':
  }
}
```

**性能要点**：`part.delta` 是高频事件（每个 token 一次）。必须做到：

1. 只更新对应 partId 的内容，不重建整个消息数组
2. 组件按 part 粒度订阅（zustand 的 selector），一个 part 更新不触发整条消息重渲染
3. Markdown 解析节流（每 50ms 或每 20 个字符解析一次，不是每个 token）

没做这三点的话，长回答生成到一半页面就开始卡——这是流式 UI 最典型的性能陷阱。

### Markdown 渲染

`react-markdown` + `remark-gfm` + `rehype-highlight`。

**安全**：模型输出是不可信内容。必须禁用原始 HTML（`react-markdown` 默认禁用，不要手动开 `rehype-raw`），否则模型输出 `<img onerror=...>` 就是 XSS。

**流式的特殊处理**：生成中的 Markdown 经常是不完整的（代码块只开了 ``` 没闭合、表格只有半行）。渲染器要能容错，不能因为语法不完整就白屏。做法是渲染前对未闭合的代码块补上闭合标记。

## 后端

### SSE 接口

`POST /chat/:sessionId/stream`，返回 `text/event-stream`。

执行流程：

```
1. 校验入参（zod）
2. 写入 user message（先落库，崩溃不丢）
3. 加载会话历史 + 上下文窗口裁剪
4. 若挂载了知识库：检索 → 组装参考资料（走 06 的检索服务）
5. 调用 LlmGateway.stream()
6. 逐 chunk 转 SSE 事件下发
7. 流结束：完整 assistant message 落库，发 done 事件
```

### 必须处理的四件事

| 事项               | 做法                                                   | 不做的后果                                     |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| 客户端断开         | `req.on('close')` → AbortController → 停止 Ollama 请求 | 用户关页面了模型还在跑，Ollama 被占死          |
| 终止事件           | 无论成功失败都发 `done` 或 `error`                     | 前端 loading 转圈永不停                        |
| 中断时的已生成内容 | 落库并标记 `interrupted`                               | 用户点了停止，已生成的内容全丢                 |
| 上下文窗口裁剪     | 按 `04` 实测的有效长度，保留最近 N 轮 + 系统提示       | 超长后 2B 模型输出质量断崖下跌，且可能直接报错 |

### 会话标题自动生成

第一轮对话结束后，用模型生成标题。**注意**：2B 模型做这件事容易多嘴（输出"好的，标题是：xxx"）。做法是限制 `numPredict` 到很小的值 + 后处理裁剪 + 失败时降级为用户问题的前 20 字。这是 `04` 的指令遵循测评会告诉你的实际情况。

### 上下文窗口策略

第一阶段用**滑动窗口**：保留系统提示 + 最近 N 轮对话，N 由 token 预算反推。

不做**对话压缩**（把早期对话总结成摘要）。它需要额外的模型调用，2B 模型的总结质量不可靠，投入产出比低。作为可选进阶记在 ADR 里。

## 实施步骤

1. contracts 补 `chat/` 模块：session、message、part、SSE 事件、请求响应。
2. Drizzle 补 `chat_sessions` / `chat_messages` 表并生成迁移。
3. 后端会话 CRUD 接口 + 消息历史分页查询。
4. 后端 SSE 流式接口（含断开处理、终止事件、上下文裁剪）。
5. 前端 `useChatStream` hook：封装 SSE 连接、事件分发、取消。
6. 前端 event reducer + zustand store。
7. UI：会话侧边栏（列表、新建、重命名、删除）。
8. UI：消息时间线 + 四种 part 的渲染组件。
9. UI：输入区（多行、Enter 发送 / Shift+Enter 换行、停止生成按钮）。
10. 接入知识库挂载：顶栏选择知识库，问答走 `06` 的检索。
11. 引用溯源：角标点击展开原文片段。
12. 会话标题自动生成。
13. 性能优化：消息列表虚拟化、Markdown 节流、part 粒度订阅。
14. 空态、加载态、错误态（Ollama 未启动的友好提示）。

## 验收标准（DoD）

- [ ] 新建会话、发消息、看到逐字流式输出（SSE 与 reducer 已单测；真模型流式需本机 Ollama 联调）
- [ ] 刷新页面后历史消息完整恢复（GET messages + hydrate 已实现，需联调确认）
- [x] 生成中点「停止」，输出立刻停止，已生成内容保留在消息里（Abort + `interrupted` 单测）
- [ ] 生成中直接关闭浏览器标签，服务端日志显示请求被取消（不是继续跑完）（需联调）
- [x] 挂载知识库后提问，回答带引用角标，点击能看到原文片段（citations 单测 + 角标 UI）
- [x] 问知识库里没有的问题，回答「资料中没有相关信息」
- [x] 让模型输出一段含 `<script>` 或 `<img onerror>` 的内容，页面**不执行**它
- [ ] 让模型生成一个超长回答（1000+ 字），生成过程中页面不卡顿，能正常滚动（需联调）
- [x] 生成中的不完整代码块（``` 未闭合）不导致渲染崩溃
- [x] 关掉 Ollama 后发消息，界面显示可操作的错误提示而不是无限 loading（错误文案单测 + error 态）
- [ ] 连续对话 20 轮后仍正常（上下文裁剪 `trimToBudget` 已单测，20 轮需联调）
- [x] 切换主题，对话区所有元素颜色正确（无硬编码色值残留）

## 验证命令

```bash
# 前置
cd docker && docker compose up -d --wait
pnpm dev:server & pnpm dev:web

# 会话 CRUD
curl -X POST http://localhost:3000/chat/sessions \
  -H 'Content-Type: application/json' -d '{"title":"测试会话"}'
curl http://localhost:3000/chat/sessions

# 流式对话（-N 关闭缓冲，才能看到逐块输出）
curl -N -X POST http://localhost:3000/chat/<SESSION_ID>/stream \
  -H 'Content-Type: application/json' \
  -d '{"content":"你好，介绍一下你自己"}'

# 取消验证：上面的命令跑到一半 Ctrl-C，观察服务端日志应有 "request aborted"

# 挂知识库的问答
curl -N -X POST http://localhost:3000/chat/<SESSION_ID>/stream \
  -H 'Content-Type: application/json' \
  -d '{"content":"知识库里说了什么","datasetIds":["<DATASET_ID>"]}'

# 消息是否落库
docker compose -f docker/docker-compose.yml exec postgres \
  psql -U ai_engine -d ai_engine \
  -c "SELECT role, jsonb_array_length(parts) AS part_count FROM chat_messages ORDER BY seq;"

# 单测与 E2E
pnpm test --filter @ai-engine/app-core -- chat
pnpm test --filter liangzui-ai-server -- chat
pnpm test:e2e -- chat
```

## 风险与备选

| 风险                                   | 处置                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 流式输出时页面卡顿                     | 按上面三条性能要点逐项排查。用 React DevTools Profiler 定位重渲染范围，重点看是不是整个消息列表在重渲染                                                      |
| SSE 在某些网络环境下被缓冲，不是真流式 | 响应头加 `X-Accel-Buffering: no`、`Cache-Control: no-cache`；确认没有中间代理                                                                                |
| qwen3.5:2b 的 think 模式输出混在正文里 | 现有代码已设 `think: false`。若要展示思考过程，需确认 Ollama 是否把 reasoning 分离到独立字段——**当前信息无法确认**，需实测后再决定 `reasoning` part 怎么填充 |
| 2B 模型答非所问、重复啰嗦              | 这是模型能力限制。可做的是：调低 temperature、加重复惩罚、提示词更约束。不可做的是假装它能力更强。在 README 的「已知限制」里如实写明                         |
| 多轮对话后回答质量下降                 | 检查是否上下文超限被静默截断。上下文使用量应该在 UI 上可见（调试模式下显示 token 数）                                                                        |
| 会话标题生成失败或很奇怪               | 降级为取用户第一条消息前 20 字。不要为了标题好看反复调提示词，收益低                                                                                         |
