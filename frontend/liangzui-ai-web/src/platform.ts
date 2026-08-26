import { NotImplementedError, type Platform } from '@ai-engine/platform';

const readTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const readViteString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

export const createWebPlatform = (): Platform => ({
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history',
    devTools: import.meta.env.DEV,
  },
  pickDirectory: () => Promise.resolve(window.prompt('请输入目录路径')),
  pickFiles: () => Promise.reject(new NotImplementedError('pickFiles')),
  kv: {
    get: (key) => Promise.resolve(window.localStorage.getItem(key)),
    set: (key, value) => {
      window.localStorage.setItem(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      window.localStorage.removeItem(key);
      return Promise.resolve();
    },
  },
  getApiBaseUrl: () => readViteString(import.meta.env.VITE_API_BASE_URL, 'http://localhost:3000'),
  openExternal: (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    return Promise.resolve();
  },
  getAppInfo: () =>
    Promise.resolve({
      name: 'Liangzui AI',
      version: readViteString(import.meta.env.VITE_APP_VERSION, '0.1.0'),
    }),
  getSystemTheme: readTheme,
  subscribeSystemTheme: (listener) => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      listener(readTheme());
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  },
  window: {
    minimize: () => Promise.resolve(),
    maximize: () => Promise.resolve(),
    close: () => Promise.resolve(),
    reload: () => {
      window.location.reload();
      return Promise.resolve();
    },
  },
});
