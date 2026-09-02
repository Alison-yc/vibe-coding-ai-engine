import {
  API_BASE_URL_STORAGE_KEY,
  NotImplementedError,
  readUiLocale,
  writeUiLocale,
  type Platform,
} from '@ai-engine/platform';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';

const readTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const createTauriKeyValueStore = () => ({
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

export const createTauriPlatform = (): Platform => {
  const kv = createTauriKeyValueStore();
  return {
    capabilities: {
      nativeDirectoryPicker: true,
      windowControls: false,
      routerMode: 'hash',
      devTools: import.meta.env.DEV,
      backendConnectionSetup: true,
      persistentChatSidebar: true,
    },
    pickDirectory: async () => {
      const selected = await open({ directory: true, multiple: false });
      return typeof selected === 'string' ? selected : null;
    },
    pickFiles: () => Promise.reject(new NotImplementedError('pickFiles')),
    kv,
    getApiBaseUrl: () =>
      window.localStorage.getItem(API_BASE_URL_STORAGE_KEY) ?? DEFAULT_API_BASE_URL,
    getUiLocale: () => readUiLocale(kv),
    setUiLocale: (locale) => writeUiLocale(kv, locale, applyUiLocale),
    openExternal: (url) => openUrl(url),
    getAppInfo: () =>
      Promise.resolve({
        name: 'Liangzui AI',
        version: '0.1.0',
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
      minimize: () => Promise.reject(new NotImplementedError('window.minimize')),
      maximize: () => Promise.reject(new NotImplementedError('window.maximize')),
      close: () => Promise.reject(new NotImplementedError('window.close')),
      reload: () => {
        window.location.reload();
        return Promise.resolve();
      },
    },
  };
};
