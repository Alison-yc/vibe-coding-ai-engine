import { ObservabilityMetricsResponseSchema } from '@ai-engine/contracts';
import { createMemoryKeyValueStore, PlatformProvider } from '@ai-engine/platform';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { appendClientErrorLog, AppErrorBoundary } from '../components/app-error-boundary';
import {
  fetchObservabilityMetrics,
  formatMs,
  ObservabilityMetricsPanel,
  ObservabilityPage,
  toLoadErrorMessage,
} from './observability-page';

const stubPlatform = {
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history' as const,
    devTools: true,
  },
  pickDirectory: async () => null,
  pickFiles: async () => [],
  kv: createMemoryKeyValueStore(),
  getApiBaseUrl: () => 'http://localhost:3000',
  openExternal: async () => undefined,
  getAppInfo: async () => ({ name: 'test', version: '0.0.0' }),
  getSystemTheme: () => 'light' as const,
  subscribeSystemTheme: () => () => undefined,
  window: {
    minimize: async () => undefined,
    maximize: async () => undefined,
    close: async () => undefined,
    reload: async () => undefined,
  },
};

describe('formatMs', () => {
  it('格式化毫秒并在缺失时显示占位符', () => {
    expect(formatMs(1234.6)).toBe('1235 ms');
    expect(formatMs(null)).toBe('—');
    expect(formatMs(undefined)).toBe('—');
  });
});

describe('toLoadErrorMessage', () => {
  it('非 Error 对象回退到默认文案', () => {
    expect(toLoadErrorMessage(new Error('bad'))).toBe('bad');
    expect(toLoadErrorMessage('bad')).toBe('加载失败');
  });
});

describe('fetchObservabilityMetrics', () => {
  it('解析后端指标响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          calls: [],
          summary: {
            totalCalls: 0,
            finishReasonCounts: {},
            contextUsageBuckets: { low: 0, medium: 0, high: 0 },
            averageTotalMs: 0,
            operationAverageMs: {},
          },
        }),
      }),
    );
    await expect(fetchObservabilityMetrics(stubPlatform)).resolves.toMatchObject({
      summary: { totalCalls: 0 },
    });
    vi.unstubAllGlobals();
  });

  it('非 2xx 响应时抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      }),
    );
    await expect(fetchObservabilityMetrics(stubPlatform)).rejects.toThrow('加载失败: 404');
    vi.unstubAllGlobals();
  });
});

describe('ObservabilityMetricsPanel', () => {
  it('渲染 finishReason 与调用表格', () => {
    const metrics = ObservabilityMetricsResponseSchema.parse({
      calls: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          traceId: '00000000-0000-4000-8000-000000000002',
          operation: 'stream',
          model: 'qwen3.5:2b',
          promptTokens: 100,
          completionTokens: 20,
          contextLimitTokens: 8192,
          firstTokenMs: 1200,
          totalMs: 3400,
          tokensPerSecond: 5.8,
          finishReason: 'length',
          toolCallCount: 0,
          toolCallValid: 0,
          recordedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
      summary: {
        totalCalls: 1,
        finishReasonCounts: { length: 1 },
        contextUsageBuckets: { low: 0, medium: 0, high: 1 },
        averageTotalMs: 3400,
        operationAverageMs: { stream: 3400 },
      },
    });
    const html = renderToStaticMarkup(createElement(ObservabilityMetricsPanel, { metrics }));
    expect(html).toContain('finishReason 分布');
    expect(html).toContain('length: 1');
    expect(html).toContain('stream');
  });

  it('finishReason 为空时显示占位符', () => {
    const metrics = ObservabilityMetricsResponseSchema.parse({
      calls: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          traceId: '00000000-0000-4000-8000-000000000002',
          operation: 'embed',
          model: 'nomic-embed-text:latest',
          promptTokens: 0,
          completionTokens: 0,
          contextLimitTokens: 8192,
          firstTokenMs: null,
          totalMs: 100,
          tokensPerSecond: null,
          finishReason: null,
          toolCallCount: 0,
          toolCallValid: 0,
          recordedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
      summary: {
        totalCalls: 1,
        finishReasonCounts: { unknown: 1 },
        contextUsageBuckets: { low: 1, medium: 0, high: 0 },
        averageTotalMs: 100,
        operationAverageMs: { embed: 100 },
      },
    });
    const html = renderToStaticMarkup(createElement(ObservabilityMetricsPanel, { metrics }));
    expect(html).toContain('—');
  });
});

describe('ObservabilityPage', () => {
  it('devTools 关闭时提示不可用', () => {
    const html = renderToStaticMarkup(
      createElement(
        PlatformProvider,
        {
          value: {
            ...stubPlatform,
            capabilities: { ...stubPlatform.capabilities, devTools: false },
          },
        },
        createElement(ObservabilityPage),
      ),
    );
    expect(html).toContain('仅开发环境可用');
  });
});

describe('AppErrorBoundary render', () => {
  it('未出错时渲染子节点', () => {
    const boundary = new AppErrorBoundary({ platform: stubPlatform, children: 'ok' });
    expect(boundary.render()).toBe('ok');
  });

  it('getDerivedStateFromError 返回 error 状态', () => {
    const error = new Error('boom');
    expect(AppErrorBoundary.getDerivedStateFromError(error)).toEqual({
      error,
      report: null,
    });
  });

  it('出错后展示复制按钮', () => {
    const boundary = new AppErrorBoundary({ platform: stubPlatform, children: 'ok' });
    boundary.state = {
      error: new Error('boom'),
      report: {
        id: '00000000-0000-4000-8000-000000000001',
        message: 'boom',
        recordedAt: new Date().toISOString(),
      },
    };
    const html = renderToStaticMarkup(boundary.render());
    expect(html).toContain('复制错误详情');
    expect(html).toContain('boom');
  });

  it('appendClientErrorLog 写入 platform kv', async () => {
    await appendClientErrorLog(stubPlatform, {
      id: '00000000-0000-4000-8000-000000000001',
      message: 'persist-me',
      recordedAt: new Date().toISOString(),
    });
    await expect(stubPlatform.kv.get('client-error-log')).resolves.toContain('persist-me');
  });

  it('appendClientErrorLog 在 kv 损坏时覆盖写入', async () => {
    await stubPlatform.kv.set('client-error-log', '{not-json');
    await appendClientErrorLog(stubPlatform, {
      id: '00000000-0000-4000-8000-000000000002',
      message: 'recovered',
      recordedAt: new Date().toISOString(),
    });
    await expect(stubPlatform.kv.get('client-error-log')).resolves.toContain('recovered');
  });

  it('copyDetails 在无 report 时不抛错', async () => {
    const boundary = new AppErrorBoundary({ platform: stubPlatform, children: 'ok' });
    boundary.state = { error: new Error('boom'), report: null };
    await expect(boundary['copyDetails']()).resolves.toBeUndefined();
  });

  it('copyDetails 优先写入 clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const boundary = new AppErrorBoundary({ platform: stubPlatform, children: 'ok' });
    boundary.state = {
      error: new Error('boom'),
      report: {
        id: '00000000-0000-4000-8000-000000000001',
        message: 'boom',
        recordedAt: new Date().toISOString(),
      },
    };
    await boundary['copyDetails']();
    expect(writeText).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('devTools 关闭时不打印 AppErrorBoundary 日志', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boundary = new AppErrorBoundary({
      platform: {
        ...stubPlatform,
        capabilities: { ...stubPlatform.capabilities, devTools: false },
      },
      children: 'ok',
    });
    vi.spyOn(boundary, 'setState').mockImplementation((state) => {
      Object.assign(boundary.state, state);
    });
    boundary.componentDidCatch(new Error('quiet'), { componentStack: 'stack' });
    expect(consoleError.mock.calls.filter((call) => call[0] === '[AppErrorBoundary]')).toHaveLength(
      0,
    );
    consoleError.mockRestore();
  });

  it('devTools 开启时打印 AppErrorBoundary 日志', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boundary = new AppErrorBoundary({ platform: stubPlatform, children: 'ok' });
    vi.spyOn(boundary, 'setState').mockImplementation((state) => {
      Object.assign(boundary.state, state);
    });
    boundary.componentDidCatch(new Error('loud'), { componentStack: 'stack' });
    expect(consoleError).toHaveBeenCalledWith(
      '[AppErrorBoundary]',
      expect.objectContaining({ message: 'loud' }),
    );
    consoleError.mockRestore();
  });

  it('copyDetails 无 clipboard 时写入 console.info', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('navigator', {});
    const boundary = new AppErrorBoundary({ platform: stubPlatform, children: 'ok' });
    boundary.state = {
      error: new Error('boom'),
      report: {
        id: '00000000-0000-4000-8000-000000000001',
        message: 'boom',
        recordedAt: new Date().toISOString(),
      },
    };
    await boundary['copyDetails']();
    expect(consoleInfo).toHaveBeenCalled();
    consoleInfo.mockRestore();
    vi.unstubAllGlobals();
  });
});
