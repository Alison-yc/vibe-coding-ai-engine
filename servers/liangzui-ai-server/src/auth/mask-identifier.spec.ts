import { describe, expect, it } from 'vitest';
import { maskIdentifier } from './mask-identifier';

describe('maskIdentifier', () => {
  it('邮箱留首字符，手机号留前三位和后四位', () => {
    expect(maskIdentifier('email', 'a@x.com')).toBe('a***@x.com');
    expect(maskIdentifier('phone', '+8613813800000')).toBe('+86 138****0000');
  });
});
