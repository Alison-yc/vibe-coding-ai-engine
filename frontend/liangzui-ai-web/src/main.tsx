import { App } from '@ai-engine/app-core';
import { PlatformProvider } from '@ai-engine/platform';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { createWebPlatform } from './platform';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('找不到 #root');
}

createRoot(rootElement).render(
  <StrictMode>
    <PlatformProvider value={createWebPlatform()}>
      <App />
    </PlatformProvider>
  </StrictMode>,
);
