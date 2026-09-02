import {
  API_BASE_URL_STORAGE_KEY,
  NotImplementedError,
  readUiLocale,
  writeUiLocale,
  type Platform,
} from '@ai-engine/platform';

const readTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const readViteString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const createWebKeyValueStore = () => ({
  get: (key: string) => Promise.resolve(window.localStorage.getItem(key)),
  set: (key: string, value: string) => {
    window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  remove: (key: string) => {
    window.localStorage.removeItem(key);
    return Promise.resolve();
  },
});

const applyUiLocale = (locale: string) => {
  document.documentElement.lang = locale;
  document.documentElement.dir = 'ltr';
};

export const createWebPlatform = (): Platform => {
  const kv = createWebKeyValueStore();
  return {
    capabilities: {
      nativeDirectoryPicker: false,
      windowControls: false,
      routerMode: 'history',
      devTools: import.meta.env.DEV,
    },
    pickDirectory: () => Promise.resolve(window.prompt('请输入目录路径')),
    pickFiles: () => Promise.reject(new NotImplementedError('pickFiles')),
    kv,
    getApiBaseUrl: () =>
      window.localStorage.getItem(API_BASE_URL_STORAGE_KEY) ??
      readViteString(import.meta.env.VITE_API_BASE_URL, 'http://localhost:3000'),
    getUiLocale: () => readUiLocale(kv),
    setUiLocale: (locale) => writeUiLocale(kv, locale, applyUiLocale),
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
  };
};
