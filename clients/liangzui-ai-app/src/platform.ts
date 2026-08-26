import { createMemoryKeyValueStore, NotImplementedError, type Platform } from '@ai-engine/platform';
import { THEME_STORAGE_KEY } from '@ai-engine/ui';
import { openUrl } from '@tauri-apps/plugin-opener';

const readTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const createTauriKeyValueStore = () => {
  const memory = createMemoryKeyValueStore();
  return {
    get: (key: string) =>
      memory.get(key).then((fromMemory) => {
        if (fromMemory !== null) return fromMemory;
        if (key === THEME_STORAGE_KEY) return window.localStorage.getItem(key);
        return null;
      }),
    set: (key: string, value: string) =>
      memory.set(key, value).then(() => {
        if (key === THEME_STORAGE_KEY) {
          window.localStorage.setItem(key, value);
        }
      }),
    remove: (key: string) =>
      memory.remove(key).then(() => {
        if (key === THEME_STORAGE_KEY) {
          window.localStorage.removeItem(key);
        }
      }),
  };
};

export const createTauriPlatform = (): Platform => ({
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'hash',
    devTools: import.meta.env.DEV,
  },
  pickDirectory: () => Promise.reject(new NotImplementedError('pickDirectory')),
  pickFiles: () => Promise.reject(new NotImplementedError('pickFiles')),
  kv: createTauriKeyValueStore(),
  getApiBaseUrl: () => 'http://localhost:3000',
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
});
