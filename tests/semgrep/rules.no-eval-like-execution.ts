// ruleid: no-eval-like-execution
import vm from 'node:vm';

export function badEval(code: string) {
  // ruleid: no-eval-like-execution
  eval(code);
}

export function badFunction(code: string) {
  // ruleid: no-eval-like-execution
  return new Function(code);
}

export function badVm(code: string) {
  // ruleid: no-eval-like-execution
  return vm.runInNewContext(code);
}

export function okJsonParse(raw: string) {
  // ok: no-eval-like-execution
  return JSON.parse(raw) as unknown;
}
