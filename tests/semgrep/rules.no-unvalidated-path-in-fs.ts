import * as fs from 'node:fs';
import path from 'node:path';

export function badRead(root: string, userPath: string) {
  // ruleid: no-unvalidated-path-in-fs
  return fs.readFile(path.join(root, userPath));
}

export function badWrite(root: string, userPath: string, body: string) {
  // ruleid: no-unvalidated-path-in-fs
  return fs.writeFile(path.join(root, userPath), body);
}

export function okLiteralRead() {
  // ok: no-unvalidated-path-in-fs
  return fs.readFile('/etc/hosts');
}
