import { describe, expect, it } from 'vitest';
import { parsePointerTrailPreference } from './ui-preferences.js';

describe('parsePointerTrailPreference', () => {
  it('默认开启，显式 false 才关闭', () => {
    expect(parsePointerTrailPreference(null)).toBe(true);
    expect(parsePointerTrailPreference('true')).toBe(true);
    expect(parsePointerTrailPreference('false')).toBe(false);
  });
});
