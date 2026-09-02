import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { abortOnClientClose } from './abort-on-client-close';

describe('abortOnClientClose', () => {
  it('在请求 close 时中止信号', () => {
    let closeListener = (): void => undefined;
    const request = {
      on: vi.fn((event: string, listener: () => void) => {
        if (event === 'close') closeListener = listener;
      }),
    } as unknown as Request;

    const signal = abortOnClientClose(request);
    expect(signal.aborted).toBe(false);
    closeListener();
    expect(signal.aborted).toBe(true);
    expect(String(signal.reason)).toContain('client closed');
  });
});
