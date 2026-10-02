import type { UiLocale } from '@ai-engine/contracts';

export type FileRef = {
  name: string;
  mimeType: string;
  size: number;
};

export type PlatformCapabilities = {
  nativeDirectoryPicker: boolean;
  windowControls: boolean;
  routerMode: 'hash' | 'history';
  devTools: boolean;
  backendConnectionSetup?: boolean;
  /** 桌面壳默认展示对话侧边栏，不依赖 lg 断点 */
  persistentChatSidebar?: boolean;
  /** 登录会话记录的客户端类型 */
  client?: 'web' | 'desktop';
};

export const API_BASE_URL_STORAGE_KEY = 'api.baseUrl';
export const AUTH_TOKEN_STORAGE_KEY = 'auth.token';

export type KeyValueStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

/** 凭证单独成接口：将来桌面端可换成系统钥匙串，调用方不变。 */
export type SecretStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type AppInfo = {
  name: string;
  version: string;
};

export type SystemTheme = 'light' | 'dark';

export type PlatformWindow = {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  reload: () => Promise<void>;
};

export type Platform = {
  readonly capabilities: PlatformCapabilities;
  pickDirectory: () => Promise<string | null>;
  pickFiles: (opts?: { accept?: string; multiple?: boolean }) => Promise<FileRef[]>;
  kv: KeyValueStore;
  secrets: SecretStore;
  getApiBaseUrl: () => string;
  getUiLocale: () => Promise<UiLocale>;
  setUiLocale: (locale: UiLocale) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getAppInfo: () => Promise<AppInfo>;
  getSystemTheme: () => SystemTheme;
  subscribeSystemTheme: (listener: (theme: SystemTheme) => void) => () => void;
  window: PlatformWindow;
};
