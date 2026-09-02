import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
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
const SettingsPage = lazy(async () => ({
  default: (await import('./pages/settings-page')).SettingsPage,
}));

const LazyPage = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={<main className="bg-background text-foreground min-h-dvh p-6">{t('loading')}</main>}
    >
      {children}
    </Suspense>
  );
};

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
    <Route path="/agent" element={<Navigate to="/chat" replace />} />
    <Route path="/agent/:sessionId" element={<LegacyAgentRedirect />} />
    <Route
      path="/settings"
      element={
        <LazyPage>
          <SettingsPage />
        </LazyPage>
      }
    />
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

const LegacyAgentRedirect = () => {
  const { sessionId } = useParams();
  return <Navigate to={sessionId ? `/chat/${sessionId}` : '/chat'} replace />;
};

const DevObservabilityRoute = ({ children }: { children: ReactNode }) => {
  const platform = usePlatform();
  if (!platform.capabilities.devTools) {
    return <Navigate to="/chat" replace />;
  }
  return children;
};
