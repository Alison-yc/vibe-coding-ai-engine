// @vitest-environment jsdom
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
});
