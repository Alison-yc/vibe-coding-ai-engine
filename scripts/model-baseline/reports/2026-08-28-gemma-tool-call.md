# 本地模型能力基线报告（2026-08-28）

> 这是可重复执行的工程评测，不是模型厂商标称能力。原始聚合数据由
> `pnpm baseline` 生成；完整模型响应不写日志，报告只保留截断抽样。

## 环境

| 项 | 值 |
| --- | --- |
| Ollama | 0.32.11 |
| 主模型 | gemma4:e2b（7fbdbf8f5e45） |
| 备选模型 | gemma4:e2b（7fbdbf8f5e45） |
| Embedding | nomic-embed-text:latest（0a109f422b47） |
| 硬件 | Apple M1 / 16 GB |
| 生成时间 | 2026-08-28T01:59:47.494Z |

## 工具调用阶梯

| id | tools | samples | legalJsonRate | selectionRate | argumentRate | falsePositiveRate |
| --- | --- | --- | --- | --- | --- | --- |
| A-1-tool | 1 | 60 | 1 | 1 | 1 | 0 |
| C-6-tools | 6 | 60 | 1 | 1 | 1 | 0 |
| G-no-tool | 3 | 60 | — | — | — | 0 |


结论：
- 本轮仅跑场景 A、C、G，未跑场景不得外推。
- 按 ADR-D01：选择正确率 ≥ 70% 且合法 JSON 率 > 80% 的最大工具数为 6。
- 嵌套参数与两步编排未测时，不得用简单工具成功率代替。

## 因此本轮决定

数据出处为上表；能力值写入 `OllamaLlmGateway.capabilities()`，来源字段为本报告路径。

1. **`gemma4:e2b` 在已测场景达到 ADR-D01 路线 A。** A（1 工具）与 C（6 工具）合法 JSON 率、选择正确率、参数正确率均为 1.0（各 60 次）；G 假阳性为 0。
2. **`maxToolCount = 6`。** 未跑 12 工具（D），不得把上限写成 12。
3. **`needsToolCallFallback = false`（仅就已测阶梯）。** 合法 JSON 率 1.0。
4. **未测 B/E/F。** 不得声称两步编排或嵌套 schema 可用。默认仍不做 Gemma，加载成本见 2026-08-26 延迟表。
5. **仍不做默认模型。** 会话切换（CR-Z2）可选用；环境变量默认保持 `qwen3.5:2b`。
6. **不单独提高 Gemma 的生成配置。** 与 Qwen 重叠的 A/C 工具指标同为 1.0，不能证明更强；Qwen 另有 12 工具、两步、嵌套的完整阶梯。Gemma 热吞吐更高（30.8 vs 23.3 tok/s）但冷启动更慢（3.8s vs 3.0s），16GB 双模型并发约 14.7s。指令/上下文未对 Gemma 单测，不得把 `numCtx`/`numPredict`/`maxToolCount` 调高。
