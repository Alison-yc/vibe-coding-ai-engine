// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { RequirePermission } from './require-permission';
import { TestAuthProvider } from './test-auth';
import { AuthContext, type AuthContextValue } from './use-auth';

const LoginProbe = () => {
  const { pathname, search } = useLocation();
  return <p data-testid="login">{`${pathname}${search}`}</p>;
};

const renderAt = (path: string, Wrapper: ComponentType<{ children: ReactNode }>) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Wrapper>
        <Routes>
          <Route
            path="/knowledge/:id"
            element={
              <RequirePermission permission="knowledge:read">
                <p data-testid="page">知识库详情</p>
              </RequirePermission>
            }
          />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </Wrapper>
    </MemoryRouter>,
  );

const statusAuth = (status: AuthContextValue['status']): AuthContextValue => ({
  status,
  me: null,
  user: null,
  isRegistered: false,
  applySession: () => Promise.resolve(),
  logout: () => Promise.resolve(),
});

afterEach(cleanup);

describe('RequirePermission', () => {
  it('访客被带原路径重定向到登录页', () => {
    renderAt('/knowledge/abc?tab=docs', ({ children }) => (
      <TestAuthProvider role="guest">{children}</TestAuthProvider>
    ));
    expect(screen.queryByTestId('page')).toBeNull();
    expect(screen.getByTestId('login').textContent).toBe(
      `/login?redirect=${encodeURIComponent('/knowledge/abc?tab=docs')}`,
    );
  });

  it('有权限的用户直接看到页面', () => {
    renderAt('/knowledge/abc', ({ children }) => (
      <TestAuthProvider role="user">{children}</TestAuthProvider>
    ));
    expect(screen.getByTestId('page').textContent).toBe('知识库详情');
  });

  it('身份确认中或认证不可用时不重定向', () => {
    for (const status of ['pending', 'unavailable'] as const) {
      renderAt('/knowledge/abc', ({ children }) => (
        <AuthContext.Provider value={statusAuth(status)}>{children}</AuthContext.Provider>
      ));
      expect(screen.queryByTestId('login')).toBeNull();
      expect(screen.queryByTestId('page')).toBeNull();
      expect(screen.getByRole('status')).toBeTruthy();
      cleanup();
    }
  });
});
