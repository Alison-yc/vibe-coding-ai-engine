import { createHash, timingSafeEqual } from 'node:crypto';

export const hashIdentifier = (identifier: string): string =>
  createHash('sha256').update(identifier).digest('hex');

export const hashVerificationCode = (purpose: string, identifier: string, code: string): string =>
  createHash('sha256').update(`${purpose}:${identifier}:${code}`).digest('hex');

export const digestEqual = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
};
