import { exec, execFile, execSync } from 'node:child_process';

export function badInterpolation(userInput: string) {
  // ruleid: no-exec-string-interpolation
  exec(`ls ${userInput}`);
}

export function badConcat(userInput: string) {
  // ruleid: no-exec-string-interpolation
  execSync('ls ' + userInput);
}

export function badShellTrue() {
  // ruleid: no-exec-string-interpolation
  execFile('ls', ['-la'], { shell: true });
}

export function okExecFile(userInput: string) {
  // ok: no-exec-string-interpolation
  execFile('ls', ['--', userInput], { shell: false });
}
