// @vitest-environment jsdom
import { API_BASE_URL_STORAGE_KEY } from '@ai-engine/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTauriPlatform } from './platform';

const openMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }));

afterEach(() => {
  window.localStorage.clear();
  openMock.mockReset();
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

  it('通过系统原生对话框选择目录并支持取消', async () => {
    openMock.mockResolvedValueOnce('/Users/example/workspace').mockResolvedValueOnce(null);
    const platform = createTauriPlatform();

    await expect(platform.pickDirectory()).resolves.toBe('/Users/example/workspace');
    expect(openMock).toHaveBeenCalledWith({ directory: true, multiple: false });
    await expect(platform.pickDirectory()).resolves.toBeNull();
    expect(platform.capabilities.nativeDirectoryPicker).toBe(true);
  });

  it('界面语言默认中文并持久化到 html lang', async () => {
    const platform = createTauriPlatform();
    await expect(platform.getUiLocale()).resolves.toBe('zh-CN');

    await platform.setUiLocale('ja-JP');

    await expect(platform.getUiLocale()).resolves.toBe('ja-JP');
    expect(document.documentElement.lang).toBe('ja-JP');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
