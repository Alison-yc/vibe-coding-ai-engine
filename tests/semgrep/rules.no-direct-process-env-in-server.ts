export function badEnv() {
  // ruleid: no-direct-process-env-in-server
  return process.env.DATABASE_URL;
}

export function okInjected(databaseUrl: string) {
  // ok: no-direct-process-env-in-server
  return databaseUrl;
}
