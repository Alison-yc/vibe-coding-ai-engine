export function badUrl() {
  // ruleid: no-hardcoded-ollama-url
  return 'http://127.0.0.1:11434';
}

export function okConfig(baseUrl: string) {
  // ok: no-hardcoded-ollama-url
  return `${baseUrl}/api/tags`;
}
