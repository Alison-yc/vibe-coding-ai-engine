import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { ObservabilityPage } from './pages/observability-page';
import { TokenGalleryPage } from './pages/token-gallery-page';

const PlaceholderPage = ({ title }: { title: string }) => (
  <main>
    <h1>{title}</h1>
    <p>页面占位，功能在后续批次实现。</p>
  </main>
);

export const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/chat" replace />} />
    <Route path="/chat" element={<PlaceholderPage title="对话" />} />
    <Route path="/chat/:sessionId" element={<PlaceholderPage title="对话" />} />
    <Route path="/knowledge" element={<PlaceholderPage title="知识库" />} />
    <Route path="/knowledge/:id" element={<PlaceholderPage title="知识库详情" />} />
    <Route path="/workflow" element={<PlaceholderPage title="工作流" />} />
    <Route path="/workflow/:id" element={<PlaceholderPage title="工作流编辑器" />} />
    <Route path="/agent" element={<PlaceholderPage title="文件助手" />} />
    <Route path="/agent/:sessionId" element={<PlaceholderPage title="文件助手" />} />
    <Route path="/settings" element={<PlaceholderPage title="设置" />} />
    <Route path="/dev/tokens" element={<TokenGalleryPage />} />
    <Route
      path="/dev/observability"
      element={
        <DevObservabilityRoute>
          <ObservabilityPage />
        </DevObservabilityRoute>
      }
    />
  </Routes>
);

const DevObservabilityRoute = ({ children }: { children: ReactNode }) => {
  const platform = usePlatform();
  if (!platform.capabilities.devTools) {
    return <Navigate to="/chat" replace />;
  }
  return children;
};
