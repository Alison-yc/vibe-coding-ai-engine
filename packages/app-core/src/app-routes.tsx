import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { usePlatform } from '@ai-engine/platform';
import { ChatPage } from './pages/chat-page';
import { KnowledgeDetailPage } from './pages/knowledge-detail-page';
import { KnowledgeListPage } from './pages/knowledge-list-page';
import { ObservabilityPage } from './pages/observability-page';
import { TokenGalleryPage } from './pages/token-gallery-page';

const WorkflowListPage = lazy(async () => ({
  default: (await import('./pages/workflow-list-page')).WorkflowListPage,
}));
const WorkflowEditorPage = lazy(async () => ({
  default: (await import('./pages/workflow-editor-page')).WorkflowEditorPage,
}));
const AgentPage = lazy(async () => ({
  default: (await import('./pages/agent-page')).AgentPage,
}));

const LazyPage = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<main className="bg-background text-foreground min-h-dvh p-6">加载中…</main>}>
    {children}
  </Suspense>
);

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
    <Route
      path="/workflow"
      element={
        <LazyPage>
          <WorkflowListPage />
        </LazyPage>
      }
    />
    <Route
      path="/workflow/:id"
      element={
        <LazyPage>
          <WorkflowEditorPage />
        </LazyPage>
      }
    />
    <Route
      path="/agent"
      element={
        <LazyPage>
          <AgentPage />
        </LazyPage>
      }
    />
    <Route
      path="/agent/:sessionId"
      element={
        <LazyPage>
          <AgentPage />
        </LazyPage>
      }
    />
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
