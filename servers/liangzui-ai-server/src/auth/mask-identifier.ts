import type { IdentityType } from '@ai-engine/contracts';

/** 邮箱留本地部分首字符，手机号留前三位和后四位。 */
export const maskIdentifier = (type: IdentityType, identifier: string): string => {
  if (type === 'email') {
    const at = identifier.indexOf('@');
    const local = at >= 0 ? identifier.slice(0, at) : identifier;
    const domain = at >= 0 ? identifier.slice(at + 1) : '';
    return `${local.slice(0, 1)}***@${domain}`;
  }
  const national = identifier.startsWith('+86') ? identifier.slice(3) : identifier;
  return `+86 ${national.slice(0, 3)}****${national.slice(-4)}`;
};
