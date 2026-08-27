import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { ChatPage } from './pages/chat-page';
import { KnowledgeDetailPage } from './pages/knowledge-detail-page';
import { KnowledgeListPage } from './pages/knowledge-list-page';
import { ObservabilityPage } from './pages/observability-page';
import { TokenGalleryPage } from './pages/token-gallery-page';

const PlaceholderPage = ({ title }: { title: string }) => (
  <main className="bg-background text-foreground mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 p-6">
    <h1 className="text-lg font-semibold">{title}</h1>
    <p className="text-muted-foreground text-sm">页面占位，功能在后续批次实现。</p>
  </main>
);

export const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/chat" replace />} />
    <Route path="/chat" element={<ChatPage />} />
    <Route path="/chat/:sessionId" element={<ChatPage />} />
    <Route path="/knowledge" element={<KnowledgeListPage />} />
    <Route path="/knowledge/:id" element={<KnowledgeDetailPage />} />
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
