import type { Page } from '@playwright/test';
import {
  ROLE_PERMISSIONS,
  type AuthSessionResponse,
  type AuthUser,
  type MeResponse,
  type RoleKey,
} from '@ai-engine/contracts';

const USER_IDS: Record<RoleKey, string> = {
  guest: '00000000-0000-4000-8000-00000000e001',
  user: '00000000-0000-4000-8000-00000000e002',
  admin: '00000000-0000-4000-8000-00000000e003',
};

const userFor = (role: RoleKey): AuthUser => ({
  id: USER_IDS[role],
  kind: role === 'guest' ? 'guest' : 'registered',
  displayName: role === 'guest' ? null : `e2e-${role}`,
  roles: [role],
  permissions: [...ROLE_PERMISSIONS[role]],
});

/**
 * 页面启动时会先签发访客令牌再取 `me`；没有真实后端时这两步失败，
 * 门控会一直停在「检查中」或把受保护路由重定向到登录页。
 */
export const mockAuth = async (page: Page, role: RoleKey = 'admin'): Promise<void> => {
  const session: AuthSessionResponse = {
    token: `e2e-${role}-token`,
    expiresAt: '2099-01-01T00:00:00.000Z',
    user: userFor('guest'),
  };
  const me: MeResponse = {
    user: userFor(role),
    identities:
      role === 'guest'
        ? []
        : [{ type: 'email', identifier: `${role}@example.com`, verifiedAt: null }],
  };
  await page.route('**/auth/guest', (route) => route.fulfill({ status: 201, json: session }));
  await page.route('**/auth/me', (route) => route.fulfill({ json: me }));
  await page.route('**/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));
};
