import { describe, expect, it, vi } from 'vitest';
import { TraceIdMiddleware } from './trace-id.middleware';
import { getTraceId, runWithRequestContext, traceIdLogProps } from './request-context';

describe('TraceIdMiddleware', () => {
  it('生成 traceId 并写入响应头与 request', () => {
    const middleware = new TraceIdMiddleware();
    const headers: Record<string, string> = {};
    const request: { header: () => undefined; traceId?: string } = { header: () => undefined };
    const response = {
      setHeader: (key: string, value: string) => {
        headers[key] = value;
      },
    };
    let capturedTraceId: string | undefined;
    middleware.use(request as never, response as never, () => {
      capturedTraceId = getTraceId();
    });
    expect(headers['x-trace-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(capturedTraceId).toBe(headers['x-trace-id']);
    expect(request.traceId).toBe(headers['x-trace-id']);
  });

  it('复用合法的 x-trace-id 请求头', () => {
    const middleware = new TraceIdMiddleware();
    const traceId = '550e8400-e29b-41d4-a716-446655440000';
    const headers: Record<string, string> = {};
    const request = {
      header: (headerName: string) => (headerName === 'x-trace-id' ? traceId : undefined),
      traceId: undefined as string | undefined,
    };
    middleware.use(
      request as never,
      {
        setHeader: (key: string, value: string) => {
          headers[key] = value;
        },
      } as never,
      vi.fn(),
    );
    expect(headers['x-trace-id']).toBe(traceId);
    expect(request.traceId).toBe(traceId);
  });
});

describe('runWithRequestContext', () => {
  it('在异步边界外读取不到 traceId', () => {
    runWithRequestContext({ traceId: '550e8400-e29b-41d4-a716-446655440000' }, () => undefined);
    expect(getTraceId()).toBeUndefined();
  });
});

describe('traceIdLogProps', () => {
  it('ALS 丢失时仍能从 request.traceId 取出', () => {
    expect(getTraceId()).toBeUndefined();
    expect(traceIdLogProps({ traceId: '550e8400-e29b-41d4-a716-446655440000' })).toEqual({
      traceId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('没有 traceId 时返回空对象', () => {
    expect(traceIdLogProps()).toEqual({});
  });
});
