import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('正确密码通过，错误密码和被篡改的格式失败', async () => {
    const stored = await hasher.hash('correct-horse');
    expect(stored.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(await hasher.verify('correct-horse', stored)).toBe(true);
    expect(await hasher.verify('wrong-password', stored)).toBe(false);
    expect(
      await hasher.verify('correct-horse', stored.replace('scrypt$16384$', 'scrypt$32768$')),
    ).toBe(false);
    expect(await hasher.verify('correct-horse', 'not-a-hash')).toBe(false);
    expect(await hasher.hash('correct-horse')).not.toBe(stored);
  }, 20_000);
});
