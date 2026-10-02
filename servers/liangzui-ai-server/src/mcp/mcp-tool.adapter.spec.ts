import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpToolAdapter } from './mcp-tool.adapter';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mcp-adapter-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('McpToolAdapter', () => {
  it('声明了路径参数时走工作区沙箱', async () => {
    await writeFile(path.join(root, 'note.md'), 'ok');
    const adapter = new McpToolAdapter(
      'filesystem__read_file',
      '读取',
      'read',
      'read_file',
      'path',
      { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async (_name, args) => JSON.stringify(args),
    );
    const prepared = await adapter.prepare(
      { path: 'note.md' },
      {
        workspaceRoot: root,
        signal: new AbortController().signal,
      },
    );
    expect(prepared.resource).toBe('note.md');
    await expect(
      adapter.prepare(
        { path: '../secret' },
        {
          workspaceRoot: root,
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow();
  });

  it('未声明路径参数时用工具名作为资源并截断输出', async () => {
    const adapter = new McpToolAdapter(
      'demo__run',
      '执行',
      'execute',
      'run',
      undefined,
      { type: 'object' },
      async () => ({ content: [{ type: 'text', text: 'x'.repeat(60 * 1024) }] }),
    );
    const prepared = await adapter.prepare(
      { q: '1' },
      {
        workspaceRoot: root,
        signal: new AbortController().signal,
      },
    );
    expect(prepared.resource).toBe('demo__run');
    const output = await adapter.execute(
      { q: '1' },
      {
        workspaceRoot: root,
        signal: new AbortController().signal,
      },
    );
    expect(adapter.toModelOutput(output)).toContain('内容已截断');
  });

  it('执行时把沙箱内绝对路径回填给 MCP', async () => {
    await writeFile(path.join(root, 'note.md'), 'ok');
    let received: Record<string, unknown> | undefined;
    const adapter = new McpToolAdapter(
      'filesystem__read_file',
      '读取',
      'read',
      'read_file',
      'path',
      { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async (_name, args) => {
        received = args;
        return { content: [{ type: 'json', json: true }] };
      },
    );
    const ctx = { workspaceRoot: root, signal: new AbortController().signal };
    const prepared = await adapter.prepare({ path: 'note.md' }, ctx);
    const output = await adapter.execute({ path: 'note.md' }, ctx, prepared);
    expect(received?.path).toBe(prepared.absolutePath);
    expect(output).toBe('');
    expect(adapter.toModelOutput('')).toContain('空结果');
    expect(await adapter.execute({ q: '1' }, ctx)).toBe('');
  });

  it('把字符串结果直接回填，空白路径回退到工具名', async () => {
    const adapter = new McpToolAdapter(
      'demo__run',
      '执行',
      'write',
      'run',
      'path',
      { type: 'object', properties: { path: { type: 'string' } } },
      async () => 'plain',
    );
    const ctx = { workspaceRoot: root, signal: new AbortController().signal };
    const prepared = await adapter.prepare({ path: '   ' }, ctx);
    expect(prepared.resource).toBe('demo__run');
    await expect(adapter.execute({ path: '.' }, ctx)).resolves.toBe('plain');
    await expect(adapter.execute({ n: 1 }, ctx, undefined)).resolves.toBe('plain');
    const numeric = new McpToolAdapter(
      'demo__n',
      'n',
      'execute',
      'n',
      undefined,
      { type: 'object' },
      async () => 1,
    );
    await expect(numeric.execute({}, ctx)).resolves.toBe('1');
    const rootAdapter = new McpToolAdapter(
      'filesystem__write_file',
      '写',
      'write',
      'write_file',
      'path',
      { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async () => 'ok',
    );
    const rootPrepared = await rootAdapter.prepare({ path: '.' }, ctx);
    expect(rootPrepared.resource).toBe('.');
  });
});
