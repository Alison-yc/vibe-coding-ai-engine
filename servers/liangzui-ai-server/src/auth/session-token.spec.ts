import { describe, expect, it } from 'vitest';
import { SessionTokenService } from './session-token';

describe('SessionTokenService', () => {
  it('签发不可预测的 token，库中只保留 sha256', () => {
    const service = new SessionTokenService();
    const issued = service.issue();
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(issued.tokenHash).toHaveLength(64);
    expect(issued.tokenHash).not.toContain(issued.token);
    expect(service.hash(issued.token)).toBe(issued.tokenHash);
    expect(service.issue().token).not.toBe(issued.token);
  });
});
