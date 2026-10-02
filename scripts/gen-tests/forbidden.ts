const FORBIDDEN = [
  { pattern: /\b(it|test|describe)\.only\b/, message: '含 it/test/describe.only' },
  { pattern: /\b(it|test|describe)\.skip\b/, message: '含 it/test/describe.skip' },
  { pattern: /\bfetch\s*\(/, message: '含真实 fetch' },
  { pattern: /\bsetTimeout\s*\(/, message: '含 setTimeout 等待' },
];

export const findForbiddenPatterns = (source: string): string[] =>
  FORBIDDEN.filter((item) => item.pattern.test(source)).map((item) => item.message);
