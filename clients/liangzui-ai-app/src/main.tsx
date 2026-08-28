import { App } from '@ai-engine/app-core';
import { API_BASE_URL_STORAGE_KEY, PlatformProvider } from '@ai-engine/platform';
import { invoke } from '@tauri-apps/api/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { createTauriPlatform } from './platform';

type SidecarStartupInfo = {
  apiBaseUrl?: string;
  error?: string;
  logPath?: string;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('找不到 #root');
}

const root = createRoot(rootElement);

const renderStartup = (message: string) => {
  root.render(
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center p-6">
      <p className="text-muted-foreground text-sm">{message}</p>
    </main>,
  );
};

const waitForSidecar = async (): Promise<void> => {
  const info = await invoke<SidecarStartupInfo>('sidecar_startup_info');
  if (!info.apiBaseUrl) return;
  window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, info.apiBaseUrl);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${info.apiBaseUrl}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // sidecar 启动和数据库迁移需要时间，超时后交给连接引导页展示可操作信息。
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

renderStartup('正在启动本地后端…');
await waitForSidecar().catch(() => undefined);

root.render(
  <StrictMode>
    <PlatformProvider value={createTauriPlatform()}>
      <App />
    </PlatformProvider>
  </StrictMode>,
);
