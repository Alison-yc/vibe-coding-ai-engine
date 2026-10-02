const logger = { info: (..._args: unknown[]) => undefined };

export function badPassword(password: string) {
  // ruleid: no-sensitive-auth-log-fields
  logger.info({ password });
}

export function badToken(token: string) {
  // ruleid: no-sensitive-auth-log-fields
  console.log({ token });
}

export function badCode(verificationCode: string) {
  // ruleid: no-sensitive-auth-log-fields
  logger.warn({ verificationCode });
}

export function okHash(password: string, token: string) {
  // ok: no-sensitive-auth-log-fields
  logger.info({ passwordLength: password.length, tokenHash: token.slice(0, 8) });
}

export function okLaterStatement(token: string) {
  // ok: no-sensitive-auth-log-fields
  logger.info('issued');
  return { token };
}
