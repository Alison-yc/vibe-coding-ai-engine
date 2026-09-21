export { NotImplementedError } from './errors';
export { createMemoryKeyValueStore } from './memory-kv';
export { readUiLocale, writeUiLocale } from './locale';
export { PlatformProvider, usePlatform } from './provider';
export { API_BASE_URL_STORAGE_KEY } from './types';
export type {
  AppInfo,
  FileRef,
  KeyValueStore,
  Platform,
  PlatformCapabilities,
  PlatformWindow,
  SystemTheme,
} from './types';
export type { UiLocale } from '@ai-engine/contracts';
