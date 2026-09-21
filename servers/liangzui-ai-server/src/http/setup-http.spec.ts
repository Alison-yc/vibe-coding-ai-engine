import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { applyHttpSetup } from './setup-http';

describe('applyHttpSetup', () => {
  it('启用 CORS 并注册全局过滤器', () => {
    const app = {
      enableCors: vi.fn(),
      useGlobalFilters: vi.fn(),
    };
    expect(applyHttpSetup(app as unknown as INestApplication)).toBe(app);
    expect(app.enableCors).toHaveBeenCalled();
    expect(app.useGlobalFilters).toHaveBeenCalled();
  });
});
