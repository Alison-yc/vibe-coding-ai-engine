import { describe, expect, it } from 'vitest';
import { resolveTauriBuildVersion } from './version';

describe('resolveTauriBuildVersion', () => {
  it('本地构建使用基础主次版本与 UTC 时间戳', () => {
    expect(resolveTauriBuildVersion('0.1.0', {}, new Date('2026-09-01T12:34:56.000Z'))).toBe(
      '0.1.20260901123456',
    );
  });

  it('发布标签优先作为正式版本', () => {
    expect(
      resolveTauriBuildVersion('0.1.0', {
        GITHUB_REF_TYPE: 'tag',
        GITHUB_REF_NAME: 'v1.2.3',
      }),
    ).toBe('1.2.3');
  });

  it('显式版本优先级最高并拒绝非法值', () => {
    expect(
      resolveTauriBuildVersion('0.1.0', {
        AI_ENGINE_APP_VERSION: '2.0.0',
        GITHUB_REF_TYPE: 'tag',
        GITHUB_REF_NAME: 'v1.2.3',
      }),
    ).toBe('2.0.0');
    expect(() =>
      resolveTauriBuildVersion('0.1.0', { AI_ENGINE_APP_VERSION: 'release-latest' }),
    ).toThrow('有效 SemVer');
  });
});
