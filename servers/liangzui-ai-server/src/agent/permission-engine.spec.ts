import { describe, expect, it } from 'vitest';
import { evaluatePermission, matchesResource } from './permission-engine';

describe('permission engine', () => {
  it('按最后匹配规则覆盖默认权限', () => {
    expect(
      evaluatePermission('read', 'src/main.ts', 'edit', [
        { tool: 'read', resource: 'src/**', effect: 'deny' },
        { tool: 'read', resource: 'src/main.ts', effect: 'allow' },
      ]),
    ).toBe('allow');
  });

  it('敏感文件读取需要审批', () => {
    expect(evaluatePermission('read', '.env', 'edit')).toBe('ask');
    expect(evaluatePermission('read', 'cert/private.pem', 'edit')).toBe('ask');
    expect(evaluatePermission('read', '.git/config', 'edit')).toBe('ask');
    expect(evaluatePermission('grep', '.env.local', 'edit')).toBe('ask');
    expect(evaluatePermission('grep', 'cert/private.key', 'edit')).toBe('ask');
  });

  it('只读模式直接拒绝写操作而不是询问', () => {
    expect(evaluatePermission('write', 'README.md', 'read-only')).toBe('deny');
    expect(evaluatePermission('edit', 'README.md', 'read-only')).toBe('deny');
  });

  it('通配符不会让单星号跨目录', () => {
    expect(matchesResource('src/*.ts', 'src/main.ts')).toBe(true);
    expect(matchesResource('src/*.ts', 'src/nested/main.ts')).toBe(false);
    expect(matchesResource('**/.env', '.env')).toBe(true);
    expect(matchesResource('file?.ts', 'file1.ts')).toBe(true);
  });
});
