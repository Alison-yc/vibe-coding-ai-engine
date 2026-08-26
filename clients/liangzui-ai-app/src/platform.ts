import { createMemoryKeyValueStore, NotImplementedError, type Platform } from '@ai-engine/platform';
import { openUrl } from '@tauri-apps/plugin-opener';

const readTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const createTauriPlatform = (): Platform => ({
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'hash',
  },
  pickDirectory: () => Promise.reject(new NotImplementedError('pickDirectory')),
  pickFiles: () => Promise.reject(new NotImplementedError('pickFiles')),
  kv: createMemoryKeyValueStore(),
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
  },
});
