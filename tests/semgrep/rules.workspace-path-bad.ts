export function onlyStartsWith(root: string, candidate: string) {
  // ruleid: require-realpath-in-path-sandbox
  return candidate.startsWith(root + '/');
}
