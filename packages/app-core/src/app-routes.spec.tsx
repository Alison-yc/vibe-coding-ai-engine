// @vitest-environment jsdom
import {
  createMemoryKeyValueStore,
  createMemorySecretStore,
  PlatformProvider,
} from '@ai-engine/platform';
import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './app-routes';
import { TestAuthProvider } from './auth/test-auth';
import { createI18nOptions } from './i18n/resources';

const i18n = createInstance();

beforeAll(async () => {
  await i18n.init(createI18nOptions('zh-CN'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const platform = {
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history' as const,
    devTools: true,
  },
  pickDirectory: async () => null,
  pickFiles: async () => [],
  kv: createMemoryKeyValueStore(),
  secrets: createMemorySecretStore(),
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

const LocationProbe = () => {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{`${pathname}${search}`}</p>;
};

const renderAs = (role: 'guest' | 'user' | 'admin') =>
  render(
    <I18nextProvider i18n={i18n}>
      <PlatformProvider value={platform}>
        <TestAuthProvider role={role}>
          <MemoryRouter initialEntries={['/dev/observability']}>
            <AppRoutes />
            <LocationProbe />
          </MemoryRouter>
        </TestAuthProvider>
      </PlatformProvider>
    </I18nextProvider>,
  );

describe('开发观测页路由', () => {
  it('没有 observability:read 的用户被带回跳地址重定向到登录页', () => {
    for (const role of ['guest', 'user'] as const) {
      renderAs(role);
      expect(screen.getByTestId('location').textContent).toBe(
        `/login?redirect=${encodeURIComponent('/dev/observability')}`,
      );
      cleanup();
    }
  });

  it('管理员停留在观测页', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    renderAs('admin');
    expect(screen.getByTestId('location').textContent).toBe('/dev/observability');
  });
});
