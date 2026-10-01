// @vitest-environment jsdom
import { AUTH_TOKEN_STORAGE_KEY } from '@ai-engine/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebPlatform } from './platform';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('createWebPlatform', () => {
  it('使用浏览器路径输入作为目录选择的安全降级', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('/srv/ai-workspace');
    const platform = createWebPlatform();

    await expect(platform.pickDirectory()).resolves.toBe('/srv/ai-workspace');
    expect(prompt).toHaveBeenCalledWith('请输入目录路径');
    expect(platform.capabilities.nativeDirectoryPicker).toBe(false);
  });

  it('取消路径输入时返回 null', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    await expect(createWebPlatform().pickDirectory()).resolves.toBeNull();
  });

  it('界面语言默认中文并持久化到 html lang', async () => {
    const platform = createWebPlatform();
    await expect(platform.getUiLocale()).resolves.toBe('zh-CN');

    await platform.setUiLocale('en-US');

    await expect(platform.getUiLocale()).resolves.toBe('en-US');
    expect(document.documentElement.lang).toBe('en-US');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('登录凭证刷新后仍可读取，并标记为 web 客户端', async () => {
    await createWebPlatform().secrets.set(AUTH_TOKEN_STORAGE_KEY, 'token-a');

    const reloaded = createWebPlatform();
    await expect(reloaded.secrets.get(AUTH_TOKEN_STORAGE_KEY)).resolves.toBe('token-a');
    expect(reloaded.capabilities.client).toBe('web');
    await reloaded.secrets.remove(AUTH_TOKEN_STORAGE_KEY);
    await expect(reloaded.secrets.get(AUTH_TOKEN_STORAGE_KEY)).resolves.toBeNull();
  });
});
