# 测试生成上下文包

## 目标文件
`scripts/gen-tests/fixtures/sample.ts`

## 未覆盖行
未从 coverage-final.json 解析到未覆盖行（可能尚未跑 pnpm test:cov）。

## 被测源码

```ts
export const clamp = (value: number, max: number): number => (value > max ? max : value);

export const isEmpty = (items: unknown[]): boolean => items.length === 0;

```

## 同目录已有测试

```ts
import { describe, expect, it } from 'vitest';
import { clamp, isEmpty } from './sample';

describe('sample fixture', () => {
  it('把超过上限的值裁成上限', () => {
    expect(clamp(9, 4)).toBe(4);
  });

  it('空数组判定为 empty', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty(['x'])).toBe(false);
  });
});

```

## 项目测试规范

---
description: 测试规范：分层策略、LLM 不确定性的处理、覆盖率门禁与 LLM 生成用例的审核要求
globs: "**/*.{test,spec}.{ts,tsx}"
alwaysApply: false
---

# 测试规范

## 分层与放置位置

| 层 | 框架 | 位置 | 要求 |
| --- | --- | --- | --- |
| 单元 | Vitest | 被测文件同目录 `__tests__/x.spec.ts` | 不碰网络、不碰数据库、不碰 Ollama |
| 集成 | Vitest | 包内 `test/integration/` | 可连本地 Postgres，用事务回滚隔离 |
| 契约 | Vitest | `packages/contracts/test/` | 校验 schema 的边界与向后兼容 |
| E2E | Playwright | `e2e/` | 只覆盖关键路径，数量控制在个位数 |

## LLM 的不确定性不能进单测

单测里**绝不真调 Ollama**。模型调用一律通过 `LlmGateway` 接口注入 fake。

```ts
// ❌ BAD —— 结果不稳定、慢、CI 上没有模型
it('翻译', async () => {
  expect(await translate('你好')).toBe('Hello');
});

// ✅ GOOD —— 断言编排逻辑，不断言模型输出内容
it('把系统提示词与用户输入按顺序传给模型', async () => {
  const llm = createFakeLlm({ reply: 'Hello' });
  await new TranslateService(llm).run('你好');
  expect(llm.calls[0].messages.map((m) => m.role)).toEqual(['system', 'user']);
});
```

模型输出质量走独立的**评测**流程（`.plan/18`），用固定数据集打分并记录趋势，不作为 CI 阻塞门禁。

## 断言行为，不断言实现

不要断言私有方法被调用几次、不要快照整个 DOM 树。断言"给定输入产生什么可观察结果"。

`it` 的标题写清可观察行为，不要写 `should work` 这种看不出测了什么的标题。

## 覆盖率门禁

- 提供方：`@vitest/coverage-v8`，配置只在根 `vitest.config.ts` 里（Vitest 的 coverage 不支持在 project 级配置）。
- 阈值分级：`packages/contracts` 与工作流/Agent 内核要求最高，UI 壳最低。具体数值见 `.plan/15`。
- 阈值只能升不能降。要降必须在 `.plan/20` 里记录一条 ADR 说明原因。

## LLM 生成的测试用例必须人工审核

生成用例可以提效，但直接合并会污染测试套件。审核这四点：

1. 断言是否真的会失败？（把实现改坏，测试必须变红）
2. 是否只是把实现代码复述了一遍？
3. 是否覆盖了边界与错误路径，而不是只有 happy path？
4. 是否引入了对时间、随机数、真实网络的依赖？

不满足的用例删掉重写，不要为了凑覆盖率保留。


## Fake 与约束

可用 Fake（不要自造 mock）：
- FakeLlmGateway：可编程 chat/stream/embed，记录 calls，可 enqueueError / enqueueStreamError
- InMemoryVectorStore：无库时的向量检索
- InMemoryChatRepository / InMemoryKnowledgeRepository：单测仓储
单测禁止真实网络、数据库、Ollama、it.only / it.skip、setTimeout 等待。


## 生成要求
请用 Vitest 为上述目标生成测试，保存为与源码同目录的 `*.generated.spec.ts`。
断言可观察行为，不要只写 toBeDefined。覆盖错误路径与空输入。生成后运行 `pnpm gen-tests:verify --file <生成文件> --target scripts/gen-tests/fixtures/sample.ts`。
