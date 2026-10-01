import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '@ai-engine/platform';
import { RequirePermission } from './auth/require-permission';
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
const LoginPage = lazy(async () => ({
  default: (await import('./pages/login-page')).LoginPage,
}));
const RegisterPage = lazy(async () => ({
  default: (await import('./pages/register-page')).RegisterPage,
}));
const ResetPasswordPage = lazy(async () => ({
  default: (await import('./pages/reset-password-page')).ResetPasswordPage,
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
    <Route
      path="/knowledge"
      element={
        <RequirePermission permission="knowledge:read">
          <KnowledgeListPage />
        </RequirePermission>
      }
    />
    <Route
      path="/knowledge/:id"
      element={
        <RequirePermission permission="knowledge:read">
          <KnowledgeDetailPage />
        </RequirePermission>
      }
    />
    <Route
      path="/workflow"
      element={
        <RequirePermission permission="workflow:read">
          <LazyPage>
            <WorkflowListPage />
          </LazyPage>
        </RequirePermission>
      }
    />
    <Route
      path="/workflow/:id"
      element={
        <RequirePermission permission="workflow:read">
          <LazyPage>
            <WorkflowEditorPage />
          </LazyPage>
        </RequirePermission>
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
    <Route
      path="/login"
      element={
        <LazyPage>
          <LoginPage />
        </LazyPage>
      }
    />
    <Route
      path="/register"
      element={
        <LazyPage>
          <RegisterPage />
        </LazyPage>
      }
    />
    <Route
      path="/reset-password"
      element={
        <LazyPage>
          <ResetPasswordPage />
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
