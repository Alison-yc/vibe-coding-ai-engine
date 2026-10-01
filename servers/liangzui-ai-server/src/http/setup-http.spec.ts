import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { applyHttpSetup } from './setup-http';

describe('applyHttpSetup', () => {
  it('按配置的白名单启用 CORS 并注册全局过滤器', () => {
    const origins = ['http://localhost:5173', 'tauri://localhost'];
    const app = {
      get: () => ({ get: (key: string) => (key === 'CORS_ORIGINS' ? origins : undefined) }),
      enableCors: vi.fn(),
      useGlobalFilters: vi.fn(),
    };
    expect(applyHttpSetup(app as unknown as INestApplication)).toBe(app);
    expect(app.enableCors).toHaveBeenCalledWith({ origin: origins });
    expect(app.useGlobalFilters).toHaveBeenCalled();
  });
});
