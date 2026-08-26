import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotImplementedError } from './errors';
import { createMemoryKeyValueStore } from './memory-kv';
import { PlatformProvider, usePlatform } from './provider';
import type { Platform } from './types';

const stubPlatform = {
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history' as const,
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
  },
} satisfies Platform;

describe('NotImplementedError', () => {
  it('说明未实现的能力与阶段', () => {
    const error = new NotImplementedError('pickDirectory');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('pickDirectory');
    expect(error.message).toContain('12-B');
  });
});

describe('createMemoryKeyValueStore', () => {
  it('读写删除键值', async () => {
    const kv = createMemoryKeyValueStore();
    await expect(kv.get('k')).resolves.toBeNull();
    await kv.set('k', 'v');
    await expect(kv.get('k')).resolves.toBe('v');
    await kv.remove('k');
    await expect(kv.get('k')).resolves.toBeNull();
  });
});

describe('usePlatform', () => {
  it('在 Provider 外使用时抛错', () => {
    const Probe = () => {
      usePlatform();
      return null;
    };
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow('PlatformProvider');
  });

  it('返回注入的 platform', () => {
    const Probe = () => usePlatform().getApiBaseUrl();
    const html = renderToStaticMarkup(
      createElement(PlatformProvider, { value: stubPlatform }, createElement(Probe)),
    );
    expect(html).toBe('http://localhost:3000');
  });
});
