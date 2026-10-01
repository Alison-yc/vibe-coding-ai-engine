import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_LOGIN_PATH, safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it.each(['/knowledge', '/workflow/abc?tab=run', '/chat/1#bottom'])('保留站内路径 %s', (path) => {
    expect(safeRedirect(path)).toBe(path);
  });

  it.each([
    null,
    undefined,
    '',
    'knowledge',
    'https://evil.example',
    'javascript:alert(1)',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
  ])('拒绝站外或畸形地址 %j', (raw) => {
    expect(safeRedirect(raw)).toBe(DEFAULT_AFTER_LOGIN_PATH);
  });

  it.each(['/login', '/login?redirect=/x', '/register', '/reset-password/x'])(
    '不回跳到认证页 %s，避免登录后原地打转',
    (path) => {
      expect(safeRedirect(path)).toBe(DEFAULT_AFTER_LOGIN_PATH);
    },
  );

  it('名称只是以认证页开头的普通路径不受影响', () => {
    expect(safeRedirect('/login-help')).toBe('/login-help');
  });
});
