export function badFetch(url: string) {
  // ruleid: no-fetch-dynamic-url-without-guard
  return fetch(url);
}

export function okLiteral() {
  // ok: no-fetch-dynamic-url-without-guard
  return fetch('https://example.com/health');
}
