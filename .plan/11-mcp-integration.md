# 11 · MCP（Model Context Protocol）集成

| 项       | 值                |
| -------- | ----------------- |
| 阶段     | M4 · Agent 与 MCP |
| 依赖     | 10                |
| 预计工期 | 2～3 天           |
| 状态     | 未开始            |

## 目标

接入 MCP 客户端，把外部 MCP server 提供的工具合并进 Agent 的工具列表，让 Agent 能用第三方能力（文件系统、数据库查询、网页抓取等）而不用自己实现。

## 先说清楚它的定位与风险

MCP 是当前 AI 应用生态的热点协议，写进简历有价值。但对本项目有一个**真实的冲突**：

`04` 会告诉你 qwen3.5:2b 能同时挂几个工具（很可能只有 3 个左右）。而一个 MCP server 动辄暴露 10～20 个工具。**全部合并进去会直接压垮模型的工具选择能力。**

所以这个 plan 的重点不是"接上就行"，而是**如何在弱模型下让 MCP 可用**。这个取舍本身就是有价值的工程思考，面试时是个好话题。

## 设计

### 客户端实现

用官方 `@modelcontextprotocol/sdk`（npm 当前 `1.30.0`）。

支持两种 transport，够用：

| transport       | 场景                                                              |
| --------------- | ----------------------------------------------------------------- |
| stdio           | 本地进程 MCP server（绝大多数场景，比如官方的 filesystem server） |
| streamable HTTP | 远程 MCP server                                                   |

**不做**：OAuth 授权流程、MCP server 目录/市场、prompts 与 resources 能力（只做 tools）。这些是规模化产品才需要的。

### 配置格式

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "<WORKSPACE>"],
      "enabled": true,
      "timeout": 10000,
      "toolFilter": {
        "include": ["read_file", "write_file", "list_directory"]
      }
    }
  }
}
```

`toolFilter` 是**为本项目专门加的字段**，不在 MCP 标准里。它解决上面说的核心冲突：手动挑选要暴露给模型的工具，把 20 个裁到 3 个。

### 工具命名与冲突

MCP 工具名可能与内置工具重名（filesystem server 也有 `read_file`）。命名策略：`{serverName}__{toolName}`。

代价是工具名变长，占提示词 token，且对小模型来说更难理解。所以：

- 单 server 且无冲突时，允许配置 `flattenNames: true` 用原名
- 冲突时内置工具优先，MCP 工具带前缀

### 权限统一

MCP 工具**必须走与内置工具相同的三层安全**（`10` 定义的）。不能因为"这是第三方 server 的工具"就跳过审批。

难点：MCP 工具的参数里哪个是"资源路径"，协议没有标准化的标注。处置：配置里手动声明。

```json
"toolPermissions": {
  "write_file": { "kind": "write", "resourceParam": "path" }
}
```

未声明的 MCP 工具默认按 `execute` 权限处理（也就是默认 ask）。**默认保守**是这里的原则。

### 生命周期

| 事项         | 做法                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| 连接时机     | 服务启动后异步连接，不阻塞启动                                                   |
| 连接失败     | 记录状态，不影响其他功能。UI 上显示该 server 离线                                |
| 进程崩溃     | 检测并标记为断开，提供手动重连；不做自动无限重连                                 |
| 服务关闭     | 优雅关闭子进程，避免僵尸进程                                                     |
| 工具列表刷新 | 连接时拉一次并缓存。不做实时订阅（MCP 的 list_changed 通知在本项目场景下收益低） |

## 安全考量

MCP server 是**你自己启动的第三方进程**，它能做什么完全取决于那个进程。风险点：

| 风险                                               | 处置                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| 恶意/有 bug 的 MCP server 读写任意文件             | 配置里明确限定 server 的工作目录参数；只用可信来源的 server                   |
| MCP 工具的返回内容是不可信数据（可能含提示词注入） | 回填给模型时按"外部数据"处理，加隔离声明（与 `06` 的参考资料同样处理）        |
| stdio server 的 command 来自配置文件，可能被篡改   | 配置文件路径固定、不接受 API 动态注入 command；启动时记录实际执行的命令到日志 |
| MCP 工具输出过大耗尽上下文                         | 与内置工具一样截断                                                            |

## 实施步骤

1. contracts 补 MCP 配置 schema 与 server 状态 schema。
2. 实现 `McpClientManager`：读配置、建立连接、拉取工具列表、生命周期管理。
3. 实现 MCP 工具到内置 `AgentTool` 接口的适配器（JSON Schema → zod 校验、结果转文本）。
4. 实现 `toolFilter` 裁剪逻辑。
5. 接入工具注册表：内置工具 + MCP 工具合并，冲突处理，总数受 `maxToolCount` 约束。
6. 接入权限层：`toolPermissions` 配置映射，未声明的默认 ask。
7. 后端接口：列出 servers 与状态、手动重连、列出某 server 的全部工具（用于配置 filter 时挑选）。
8. 前端设置页：MCP server 列表、连接状态、启用开关、工具勾选。
9. 用官方 filesystem server 做端到端验证。
10. 在 `18` 里记录：挂载 MCP 工具前后，模型工具选择正确率的变化。**这个对比数据很有说服力。**

## 验收标准（DoD）

- [ ] 配置一个 stdio 的 filesystem MCP server，服务启动后连接成功
- [ ] 前端设置页能看到该 server 的工具列表与连接状态
- [ ] `toolFilter` 生效：只有勾选的工具出现在模型可用列表里
- [ ] MCP 工具的调用走了审批流程（不是直接执行）
- [ ] 配置一个不存在的 command，服务正常启动，该 server 标记为连接失败，其他功能不受影响
- [ ] 手动重连能恢复连接
- [ ] 停止服务后，`ps` 里没有残留的 MCP server 子进程
- [ ] 工具名冲突时，内置工具优先，MCP 工具带 server 前缀
- [ ] 总工具数超过 `maxToolCount` 时被裁剪，且有日志说明裁掉了哪些
- [ ] MCP 工具返回的内容被当作不可信数据处理（在文件里写入提示词注入内容，模型不照做）
- [ ] 记录了挂载 MCP 前后的工具选择正确率对比

## 验证命令

```bash
# 先单独验证 MCP server 本身能跑（不经过我们的代码）
npx -y @modelcontextprotocol/server-filesystem /tmp/ai-engine-sandbox

# 启动服务
pnpm dev:server

# 查看 server 状态
curl http://localhost:3000/mcp/servers

# 查看某 server 的全部工具（配置 filter 时用）
curl http://localhost:3000/mcp/servers/filesystem/tools

# 手动重连
curl -X POST http://localhost:3000/mcp/servers/filesystem/reconnect

# 查看最终暴露给模型的工具列表（含裁剪结果）
curl http://localhost:3000/agent/tools?sessionId=<SESSION_ID>

# 端到端：让 Agent 用 MCP 工具
curl -N -X POST http://localhost:3000/agent/<SESSION_ID>/stream \
  -H 'Content-Type: application/json' \
  -d '{"content":"列出工作区里的文件","workspaceRoot":"/tmp/ai-engine-sandbox"}'

# 子进程泄漏检查（停服务后执行，应无输出）
pkill -f 'pnpm dev:server'
ps aux | grep -c 'server-filesystem'

pnpm test --filter liangzui-ai-server -- mcp
```

## 风险与备选

| 风险                                             | 处置                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| MCP 工具太多压垮 2B 模型                         | 这是核心矛盾。靠 `toolFilter` 强制裁剪，并在文档里如实说明这个限制                                                   |
| `@modelcontextprotocol/sdk` 的 API 在 1.x 内变化 | 锁定小版本；适配器层隔离，SDK 变化只影响一个文件                                                                     |
| stdio server 的 npx 首次下载很慢，连接超时       | 超时设宽松（30s）；文档里建议先手动 `npx` 一次预热缓存                                                               |
| 这个 plan 的收益不如预期（模型用不好 MCP 工具）  | **可以接受**。如实记录"在 2B 模型上 MCP 的实际可用性有限"，这个结论本身有价值。不要为了让 demo 好看而隐藏            |
| 优先级冲突：M5 的双端交付更重要                  | 这个 plan 是 M4 里优先级最低的。如果时间紧，允许搁置并在 README 里标为"规划中"。不要为了功能数量牺牲已有功能的完成度 |
