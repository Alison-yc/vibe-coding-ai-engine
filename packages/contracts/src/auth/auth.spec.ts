import { describe, expect, it } from 'vitest';
import { SendCodeRequestSchema } from './requests.js';
import { normalizeEmail, normalizePhone } from './identity.js';
import { PasswordSchema } from './password.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from './permissions.js';

describe('登录标识规范化', () => {
  it('邮箱去空格并转小写', () => {
    expect(normalizeEmail('  A@X.com ')).toBe('a@x.com');
    expect(
      SendCodeRequestSchema.parse({
        type: 'email',
        identifier: '  A@X.com ',
        purpose: 'register',
      }).identifier,
    ).toBe('a@x.com');
  });

  it('手机号接受裸号、+86 与分隔符', () => {
    expect(normalizePhone('13800138000')).toBe('+8613800138000');
    expect(normalizePhone('+86 138-0013-8000')).toBe('+8613800138000');
    expect(normalizePhone('8613800138000')).toBe('+8613800138000');
  });

  it('拒绝非法邮箱和手机号', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('+1 4155550100')).toBeNull();
    expect(
      SendCodeRequestSchema.safeParse({
        type: 'email',
        identifier: 'not-an-email',
        purpose: 'login',
      }).success,
    ).toBe(false);
    expect(
      SendCodeRequestSchema.safeParse({ type: 'phone', identifier: '1380013800', purpose: 'login' })
        .success,
    ).toBe(false);
  });
});

describe('密码与权限', () => {
  it('密码长度限制在 8 到 72', () => {
    expect(PasswordSchema.safeParse('short').success).toBe(false);
    expect(PasswordSchema.safeParse('long-enough').success).toBe(true);
    expect(PasswordSchema.safeParse('x'.repeat(73)).success).toBe(false);
  });

  it('访客只有对话和切模型，管理员拥有全部权限', () => {
    expect(ROLE_PERMISSIONS.guest).toEqual(['chat:basic', 'chat:model-switch']);
    expect(ROLE_PERMISSIONS.guest).not.toContain('chat:tools');
    expect(ROLE_PERMISSIONS.user).not.toContain('mcp:manage');
    expect(ROLE_PERMISSIONS.user).not.toContain('observability:read');
    expect(ROLE_PERMISSIONS.admin).toEqual(PERMISSIONS);
  });
});
