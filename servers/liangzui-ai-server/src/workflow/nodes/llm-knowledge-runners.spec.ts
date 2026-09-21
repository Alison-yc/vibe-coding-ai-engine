import { describe, expect, it, vi } from 'vitest';
import { FakeLlmGateway } from '../../llm/fake-llm-gateway';
import { VariablePool } from '../engine/variable-pool';
import {
  KnowledgeRetrievalNodeRunner,
  type KnowledgeRetriever,
} from './knowledge-retrieval.runner';
import { LlmNodeRunner } from './llm.runner';

const context = {
  runId: '00000000-0000-4000-8000-000000000001',
  nodeId: 'node',
  signal: new AbortController().signal,
  emit: vi.fn(),
};

describe('LlmNodeRunner', () => {
  it('渲染模板、转发流式文本并返回完整输出', async () => {
    const gateway = new FakeLlmGateway();
    gateway.enqueueStream([
      { event: 'chunk', data: { text: '答' } },
      { event: 'chunk', data: { text: '案' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    const result = await new LlmNodeRunner(gateway).run(
      { prompt: '问题：{{#sys.query#}}', systemPrompt: '只回答问题' },
      new VariablePool({ query: '你好' }),
      context,
    );
    expect(result.outputs).toEqual({ text: '答案' });
    expect(context.emit).toHaveBeenCalledTimes(2);
    expect(gateway.calls[0]).toMatchObject({
      method: 'stream',
      request: { content: '问题：你好' },
    });
  });

  it('透传模型错误并拒绝空输出', async () => {
    const failed = new FakeLlmGateway();
    failed.enqueueStream([{ event: 'error', data: { message: '模型失败' } }]);
    await expect(
      new LlmNodeRunner(failed).run({ prompt: '问题' }, new VariablePool({}), context),
    ).rejects.toThrow('模型失败');

    const empty = new FakeLlmGateway();
    empty.enqueueStream([{ event: 'done', data: {} }]);
    await expect(
      new LlmNodeRunner(empty).run({ prompt: '问题' }, new VariablePool({}), context),
    ).rejects.toThrow('没有生成文本');
  });
});

describe('KnowledgeRetrievalNodeRunner', () => {
  it('渲染 query 并复用知识检索服务', async () => {
    const retrieve = vi.fn<KnowledgeRetriever['retrieve']>().mockResolvedValue({ hits: [] });
    const runner = new KnowledgeRetrievalNodeRunner({ retrieve });
    await expect(
      runner.run(
        {
          datasetId: '00000000-0000-4000-8000-000000000002',
          query: '{{#sys.query#}}',
          topK: 3,
          scoreThreshold: 0.5,
        },
        new VariablePool({ query: 'Dify' }),
        context,
      ),
    ).resolves.toEqual({ outputs: { chunks: [] } });
    expect(retrieve).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002', {
      query: 'Dify',
      topK: 3,
      scoreThreshold: 0.5,
    });
  });

  it('拒绝空 query 和已取消运行', async () => {
    const retrieve = vi.fn<KnowledgeRetriever['retrieve']>().mockResolvedValue({ hits: [] });
    const runner = new KnowledgeRetrievalNodeRunner({ retrieve });
    await expect(
      runner.run(
        {
          datasetId: '00000000-0000-4000-8000-000000000002',
          query: '{{#sys.query#}}',
          topK: 3,
          scoreThreshold: 0.5,
        },
        new VariablePool({}),
        context,
      ),
    ).rejects.toThrow('不能为空');

    const controller = new AbortController();
    controller.abort(new Error('停止'));
    await expect(
      runner.run(
        {
          datasetId: '00000000-0000-4000-8000-000000000002',
          query: 'query',
          topK: 3,
          scoreThreshold: 0.5,
        },
        new VariablePool({}),
        { ...context, signal: controller.signal },
      ),
    ).rejects.toThrow('停止');
  });
});
