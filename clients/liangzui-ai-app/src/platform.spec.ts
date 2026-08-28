// @vitest-environment jsdom
import { API_BASE_URL_STORAGE_KEY } from '@ai-engine/platform';
import { afterEach, describe, expect, it } from 'vitest';
import { createTauriPlatform } from './platform';

afterEach(() => {
  window.localStorage.clear();
});

describe('createTauriPlatform', () => {
  it('默认连接 3000 端口并持久化用户配置', async () => {
    const platform = createTauriPlatform();
    expect(platform.getApiBaseUrl()).toBe('http://localhost:3000');

    await platform.kv.set(API_BASE_URL_STORAGE_KEY, 'http://127.0.0.1:3100');
    expect(createTauriPlatform().getApiBaseUrl()).toBe('http://127.0.0.1:3100');
  });

  it('声明桌面端启动时需要检查后端连接', () => {
    expect(createTauriPlatform().capabilities.backendConnectionSetup).toBe(true);
  });

  it('桌面端默认展示常驻对话侧边栏', () => {
    expect(createTauriPlatform().capabilities.persistentChatSidebar).toBe(true);
  });
});
