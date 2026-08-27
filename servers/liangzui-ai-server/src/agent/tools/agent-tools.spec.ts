import { access, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditTool } from './edit.tool';
import { GlobTool } from './glob.tool';
import { GrepTool } from './grep.tool';
import { ReadTool } from './read.tool';
import { WriteTool } from './write.tool';
import { AgentToolRegistry } from './tool';
import { truncateDiff, truncateToolOutput } from './tool-output';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'agent-tools-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const context = () => ({ workspaceRoot: root, signal: new AbortController().signal });

describe('agent file tools', () => {
  it('read 分页读取并明确标记截断', async () => {
    await writeFile(
      path.join(root, 'large.txt'),
      Array.from({ length: 2100 }, (_, index) => `line-${index}`).join('\n'),
    );
    const tool = new ReadTool();
    const output = await tool.execute({ path: 'large.txt', limit: 20 }, context());
    expect(output.truncated).toBe(true);
    expect(tool.toModelOutput(output)).toContain('内容已截断');
    expect(output.content).toContain('1|line-0');
    await expect(tool.prepare({ path: 'large.txt' }, context())).resolves.toEqual(
      expect.objectContaining({
        resource: 'large.txt',
      }),
    );
    await writeFile(path.join(root, 'wide.txt'), 'x'.repeat(60 * 1024));
    await expect(tool.execute({ path: 'wide.txt' }, context())).resolves.toEqual({
      content: '',
      truncated: true,
    });
  });

  it('write 创建文件，edit 只执行唯一精确替换', async () => {
    const write = new WriteTool();
    await write.execute({ path: 'README.md', content: 'hello world' }, context());
    const edit = new EditTool();
    await edit.execute({ path: 'README.md', oldString: 'hello', newString: '你好' }, context());
    await expect(readFile(path.join(root, 'README.md'), 'utf8')).resolves.toBe('你好 world');
    await expect(
      edit.prepare({ path: 'README.md', oldString: '你好', newString: 'hello' }, context()),
    ).resolves.toEqual(
      expect.objectContaining({ resource: 'README.md', diff: expect.stringContaining('+hello') }),
    );
    expect(edit.toModelOutput({ bytesWritten: 11 })).toContain('11');
    await writeFile(path.join(root, 'duplicate.txt'), 'same same');
    await expect(
      edit.execute({ path: 'duplicate.txt', oldString: 'same', newString: 'changed' }, context()),
    ).rejects.toThrow('当前找到 2 处');
  });

  it('glob 查找文件名且拒绝父目录模式', async () => {
    await writeFile(path.join(root, 'one.ts'), '');
    await writeFile(path.join(root, 'two.md'), '');
    await writeFile(path.join(root, '.env'), 'SECRET=hidden');
    await writeFile(path.join(root, 'private.pem'), 'hidden');
    const tool = new GlobTool();
    await expect(tool.execute({ pattern: '*.ts' }, context())).resolves.toEqual(['one.ts']);
    await expect(tool.execute({ pattern: '*' }, context())).resolves.not.toEqual(
      expect.arrayContaining(['.env', 'private.pem']),
    );
    await expect(tool.execute({ pattern: '../*.ts' }, context())).rejects.toThrow('不得包含');
    expect(tool.toModelOutput(Array.from({ length: 1001 }, (_, index) => `${index}.ts`))).toContain(
      '1000 条',
    );
  });

  it('grep 将恶意 pattern 作为参数而不是 shell 命令执行', async () => {
    await writeFile(path.join(root, 'source.txt'), 'safe content');
    await writeFile(path.join(root, '.env'), 'SECRET=hidden-value');
    const marker = path.join(root, 'owned');
    const tool = new GrepTool();
    await expect(
      tool.execute({ pattern: `safe; touch ${marker}`, path: '.' }, context()),
    ).resolves.toBe('');
    await expect(access(marker)).rejects.toThrow();
    await expect(tool.prepare({ pattern: 'safe', path: 'source.txt' }, context())).resolves.toEqual(
      expect.objectContaining({
        resource: 'source.txt',
      }),
    );
    await expect(tool.execute({ pattern: 'safe', path: '.' }, context())).resolves.toContain(
      'safe content',
    );
    await expect(tool.execute({ pattern: 'safe' }, context())).resolves.toContain('safe content');
    await expect(tool.execute({ pattern: 'hidden-value', path: '.' }, context())).resolves.toBe('');
    await expect(tool.prepare({ pattern: 'safe' }, context())).resolves.toEqual(
      expect.objectContaining({
        resource: '.',
      }),
    );
    await expect(tool.execute({ pattern: '[', path: '.' }, context())).rejects.toThrow();
    expect(tool.toModelOutput('')).toBe('没有匹配结果');
  });

  it('grep 输出超过缓冲区时返回截断提示', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, fileIndex) =>
        writeFile(
          path.join(root, `many-${fileIndex}.txt`),
          Array.from(
            { length: 50 },
            (_, lineIndex) => `match-${lineIndex}-${'x'.repeat(180)}`,
          ).join('\n'),
        ),
      ),
    );
    const output = await new GrepTool().execute({ pattern: 'match-', path: '.' }, context());
    expect(output).toContain('搜索结果已截断');
  });

  it('审批后的执行绑定已校验路径并拒绝新建文件竞态', async () => {
    await writeFile(path.join(root, 'approved.txt'), 'approved');
    await writeFile(path.join(root, 'swapped.txt'), 'swapped');
    const link = path.join(root, 'link.txt');
    await symlink(path.join(root, 'approved.txt'), link);
    const read = new ReadTool();
    const preparedRead = await read.prepare({ path: 'link.txt' }, context());
    await rm(link);
    await symlink(path.join(root, 'swapped.txt'), link);
    await expect(read.execute({ path: 'link.txt' }, context(), preparedRead)).rejects.toThrow(
      '权限检查后发生变化',
    );

    const outside = await mkdtemp(path.join(tmpdir(), 'agent-tools-outside-'));
    try {
      const outsideFile = path.join(outside, 'outside.txt');
      await writeFile(outsideFile, 'unchanged');
      const write = new WriteTool();
      const preparedWrite = await write.prepare({ path: 'new.txt', content: 'owned' }, context());
      await symlink(outsideFile, path.join(root, 'new.txt'));
      await expect(
        write.execute({ path: 'new.txt', content: 'owned' }, context(), preparedWrite),
      ).rejects.toThrow();
      await expect(readFile(outsideFile, 'utf8')).resolves.toBe('unchanged');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('registry 统一校验 schema、裁剪列表并拒绝重复工具', async () => {
    const registry = new AgentToolRegistry();
    const read = new ReadTool();
    registry.register(read);
    expect(registry.list(['read', 'write'])).toHaveLength(1);
    expect(registry.get('missing')).toBeNull();
    expect(() => registry.register(read)).toThrow('已注册');
    expect(() => registry.get('read')?.parse({})).toThrow();
  });

  it('工具输出与审批 diff 都有上限', () => {
    expect(truncateToolOutput('x'.repeat(60 * 1024))).toContain('超过 50KB');
    expect(truncateToolOutput('short')).toBe('short');
    expect(truncateDiff('x'.repeat(100_000))).toContain('diff 已截断');
    expect(truncateDiff('short')).toBe('short');
  });

  it('write 审批预览覆盖新建与覆盖两种情况', async () => {
    const tool = new WriteTool();
    await expect(tool.prepare({ path: 'new.md', content: 'new' }, context())).resolves.toEqual(
      expect.objectContaining({ resource: 'new.md', diff: expect.stringContaining('+new') }),
    );
    await writeFile(path.join(root, 'existing.md'), 'old');
    await expect(tool.prepare({ path: 'existing.md', content: 'new' }, context())).resolves.toEqual(
      expect.objectContaining({ diff: expect.stringContaining('-old') }),
    );
    await expect(tool.prepare({ path: '.', content: 'new' }, context())).rejects.toThrow();
    expect(tool.toModelOutput({ bytesWritten: 3 })).toContain('3');
  });
});
