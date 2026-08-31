import { getQuickJS } from 'quickjs-emscripten';

export type QuickJsSandboxOptions = {
  timeoutMs?: number;
  memoryLimitBytes?: number;
  maxStackSizeBytes?: number;
  maxOutputBytes?: number;
};

const utf8Size = (value: string): number => new TextEncoder().encode(value).byteLength;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const FULLWIDTH_JS_PUNCTUATION: Record<string, string> = {
  '（': '(',
  '）': ')',
  '｛': '{',
  '｝': '}',
  '［': '[',
  '］': ']',
  '；': ';',
  '，': ',',
  '：': ':',
  '＋': '+',
  '－': '-',
  '＝': '=',
  '＊': '*',
  '／': '/',
  '％': '%',
  '＆': '&',
  '｜': '|',
  '！': '!',
  '？': '?',
  '＂': '"',
  '＇': "'",
  '｀': '`',
  '＜': '<',
  '＞': '>',
};

/** 中文输入法常把 JS 标点打成全角，导致 Number（x）一类语法错误。 */
export const normalizeFullwidthJsPunctuation = (code: string): string =>
  code.replace(/[（）｛｝［］；，：＋－＝＊／％＆｜！？：＂＇｀＜＞]/g, (char) => {
    return FULLWIDTH_JS_PUNCTUATION[char] ?? char;
  });

const errorDetail = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message.trim() : '未知错误';

export class QuickJsSandbox {
  constructor(private readonly options: QuickJsSandboxOptions = {}) {}

  async execute(
    code: string,
    inputs: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const quickJs = await getQuickJS();
    const timeoutMs = this.options.timeoutMs ?? 3_000;
    const deadline = Date.now() + timeoutMs;
    const inputJson = JSON.stringify(inputs).replaceAll('<', '\\u003c');
    const source = normalizeFullwidthJsPunctuation(code);
    const wrapped = `JSON.stringify((function(inputs){"use strict";\n${source}\n})(JSON.parse(${JSON.stringify(inputJson)})))`;

    let serialized: unknown;
    try {
      serialized = quickJs.evalCode(wrapped, {
        memoryLimitBytes: this.options.memoryLimitBytes ?? 16 * 1024 * 1024,
        maxStackSizeBytes: this.options.maxStackSizeBytes ?? 512 * 1024,
        shouldInterrupt: () => signal.aborted || Date.now() >= deadline,
      });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (
        Date.now() >= deadline ||
        (error instanceof Error && error.message.includes('interrupted'))
      ) {
        throw new Error(`Code 节点执行超过 ${timeoutMs}ms`);
      }
      throw new Error(`Code 节点执行失败：${errorDetail(error)}`, { cause: error });
    }

    if (typeof serialized !== 'string') {
      throw new Error('Code 节点必须返回可序列化对象');
    }
    if (utf8Size(serialized) > (this.options.maxOutputBytes ?? 1_000_000)) {
      throw new Error('Code 节点输出超过大小限制');
    }
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) {
      throw new Error('Code 节点必须返回对象');
    }
    return parsed;
  }
}
