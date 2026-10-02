import { describe, expect, it } from 'vitest';
import { normalizeFullwidthJsPunctuation, QuickJsSandbox } from './quickjs-sandbox';

describe('QuickJsSandbox', () => {
  it('在隔离环境中运行代码并返回对象', async () => {
    const result = await new QuickJsSandbox().execute(
      'return { total: inputs.a + inputs.b };',
      { a: 2, b: 3 },
      new AbortController().signal,
    );
    expect(result).toEqual({ total: 5 });
  });

  it('把全角括号规范化后支持 Number(inputs.value)', async () => {
    expect(normalizeFullwidthJsPunctuation('Number（inputs.value）+ 11')).toBe(
      'Number(inputs.value)+ 11',
    );
    await expect(
      new QuickJsSandbox().execute(
        'return { result: Number（inputs.value） + 11 };',
        { value: '5' },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ result: 16 });
  });

  it.each([
    "return require('node:fs').readFileSync('/etc/passwd', 'utf8');",
    'return { env: process.env };',
  ])('禁止访问 Node 能力', async (code) => {
    await expect(
      new QuickJsSandbox().execute(code, {}, new AbortController().signal),
    ).rejects.toThrow(/执行失败/);
  });

  it('语法错误时透出具体原因', async () => {
    await expect(
      new QuickJsSandbox().execute('return {;', {}, new AbortController().signal),
    ).rejects.toThrow(/执行失败：/);
  });

  it('中断无限循环并限制输出大小', async () => {
    await expect(
      new QuickJsSandbox({ timeoutMs: 10 }).execute(
        'while (true) {}',
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('执行超过');
    await expect(
      new QuickJsSandbox({ maxOutputBytes: 8 }).execute(
        "return { value: '0123456789' };",
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('输出超过');
  });

  it('拒绝非对象返回值并响应外部取消', async () => {
    await expect(
      new QuickJsSandbox().execute('return 1;', {}, new AbortController().signal),
    ).rejects.toThrow('必须返回对象');
    const controller = new AbortController();
    controller.abort(new Error('用户停止'));
    await expect(
      new QuickJsSandbox().execute('while (true) {}', {}, controller.signal),
    ).rejects.toThrow('用户停止');
  });

  it('在超大结果复制到宿主前由 WASM 内存上限中止', async () => {
    await expect(
      new QuickJsSandbox({ memoryLimitBytes: 1024 * 1024 }).execute(
        "return { value: 'x'.repeat(10_000_000) };",
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('执行失败');
  });
});
