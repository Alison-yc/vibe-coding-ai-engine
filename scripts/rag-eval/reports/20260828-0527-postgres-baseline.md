# RAG 评测报告：postgres-baseline

> 由 `pnpm rag-eval` 生成。评测使用固定人工标注集；规则指标不使用 LLM 裁判。

## 运行信息

| 项 | 值 |
| --- | --- |
| 生成时间 | 2026-08-28T05:27:16.789Z |
| 目录内上一份报告 | 20260827-0941-baseline.md |

## 配置快照

| 配置 | 值 |
| --- | --- |
| apiBaseUrl | http://localhost:3000 |
| chatModel | qwen3.5:2b |
| embeddingModel | nomic-embed-text:latest |
| numCtx | 8192 |
| numPredict | 2048 |
| temperature | 0.2 |
| vectorBackend | postgres |
| chunkStrategy | recursive |
| chunkSize | 500 |
| overlap | 50 |
| topK | 5 |
| scoreThreshold | 0.3 |
| promptVersion | rag-v1-delimiter-escaped |
| selectedDatasets | retrieval, qa, refusal, injection |

## 指标

| 指标 | 本次 | 相比上次 |
| --- | ---: | ---: |
| retrieval.recallAtK | 0.7000 | 0 |
| retrieval.mrr | 0.5911 | 0 |
| retrieval.hitRate | 0.7000 | 0 |
| retrieval.averageTopScore | 0.5367 | 0 |
| qa.keywordCoverage | 0.7444 | +0.0333 |
| qa.citationAccuracy | 0.0667 | -0.0333 |
| qa.averageResponseLength | 84.3000 | +6.5333 |
| refusal.refusalAccuracy | 1 | 0 |
| refusal.hallucinationRate | 0 | 0 |
| injection.resistanceRate | 0.9000 | 0 |
| injection.attackRetrievedRate | 1 | 0 |

## 说明

- Recall@k 是每条问题中「期望文档落在 topK 的比例」再取平均；命中率是至少命中一篇期望文档的问题比例。
- 引用准确率只认回答正文里的 [#n] 标记，不把检索接口原样返回的 citations 当成模型引用。
- 注入抵抗率看回答是否含 canary；attackRetrievedRate 单独记录攻击文档是否进入上下文。
- 「相比上次」对比的是 reports 目录里按文件名排序的上一份报告，不是实验对照。单变量归因请用 `pnpm rag-eval:compare <对照报告> <本报告>`。本文件对照应使用同环境 PostgreSQL 基线自身，检索指标与 memory 基线相同不代表可混用后端。

<!-- rag-eval-summary:{"generatedAt":"2026-08-28T05:27:16.789Z","label":"postgres-baseline","config":{"apiBaseUrl":"http://localhost:3000","chatModel":"qwen3.5:2b","embeddingModel":"nomic-embed-text:latest","numCtx":8192,"numPredict":2048,"temperature":0.2,"vectorBackend":"postgres","chunkStrategy":"recursive","chunkSize":500,"overlap":50,"topK":5,"scoreThreshold":0.3,"promptVersion":"rag-v1-delimiter-escaped","selectedDatasets":["retrieval","qa","refusal","injection"]},"metrics":{"retrieval":{"sampleCount":30,"recallAtK":0.7,"mrr":0.5911,"hitRate":0.7,"averageTopScore":0.5367},"qa":{"sampleCount":30,"keywordCoverage":0.7444,"citationAccuracy":0.0667,"averageResponseLength":84.3},"refusal":{"sampleCount":15,"refusalAccuracy":1,"hallucinationRate":0},"injection":{"sampleCount":10,"resistanceRate":0.9,"attackRetrievedRate":1}},"previousReport":"20260827-0941-baseline.md","comparison":{"retrieval.recallAtK":0,"retrieval.mrr":0,"retrieval.hitRate":0,"retrieval.averageTopScore":0,"qa.keywordCoverage":0.0333,"qa.citationAccuracy":-0.0333,"qa.averageResponseLength":6.5333,"refusal.refusalAccuracy":0,"refusal.hallucinationRate":0,"injection.resistanceRate":0,"injection.attackRetrievedRate":0}} -->
