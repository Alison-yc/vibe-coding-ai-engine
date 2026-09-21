const logger = { info: (..._args: unknown[]) => undefined };

export function badLog(content: string) {
  // ruleid: no-full-content-logging
  logger.info(content);
}

export function okLogLength(content: string) {
  // ok: no-full-content-logging
  logger.info({ bytes: content.length });
}
