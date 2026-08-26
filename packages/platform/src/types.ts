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
};

export type KeyValueStore = {
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
  getApiBaseUrl: () => string;
  openExternal: (url: string) => Promise<void>;
  getAppInfo: () => Promise<AppInfo>;
  getSystemTheme: () => SystemTheme;
  subscribeSystemTheme: (listener: (theme: SystemTheme) => void) => () => void;
  window: PlatformWindow;
};
