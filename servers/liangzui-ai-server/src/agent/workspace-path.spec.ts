import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertAllowedWorkspaceRoot,
  PathEscapeError,
  resolveWorkspacePath,
  WorkspaceRootsNotConfiguredError,
} from './workspace-path';

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('workspace path sandbox', () => {
  it('允许解析工作区内文件', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agent-root-'));
    cleanup.push(root);
    await writeFile(path.join(root, 'README.md'), 'ok');
    await expect(resolveWorkspacePath(root, 'README.md')).resolves.toBe(
      await realpath(path.join(root, 'README.md')),
    );
  });

  it('拒绝 .. 路径穿越', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'agent-parent-'));
    const root = path.join(parent, 'workspace');
    cleanup.push(parent);
    await mkdir(root);
    await writeFile(path.join(parent, 'secret.txt'), 'secret');
    await expect(resolveWorkspacePath(root, '../secret.txt')).rejects.toBeInstanceOf(
      PathEscapeError,
    );
  });

  it('拒绝工作区内指向外部的符号链接', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'agent-link-'));
    const root = path.join(parent, 'workspace');
    const outside = path.join(parent, 'outside');
    cleanup.push(parent);
    await mkdir(root);
    await mkdir(outside);
    await writeFile(path.join(outside, 'secret.txt'), 'secret');
    await symlink(outside, path.join(root, 'escape'));
    await expect(resolveWorkspacePath(root, 'escape/secret.txt')).rejects.toBeInstanceOf(
      PathEscapeError,
    );
  });

  it('写入已存在的外部符号链接也会被拒绝', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'agent-write-link-'));
    const root = path.join(parent, 'workspace');
    const outside = path.join(parent, 'outside.txt');
    cleanup.push(parent);
    await mkdir(root);
    await writeFile(outside, 'secret');
    await symlink(outside, path.join(root, 'linked.txt'));
    await expect(
      resolveWorkspacePath(root, 'linked.txt', { allowMissing: true }),
    ).rejects.toBeInstanceOf(PathEscapeError);
  });

  it('只接受白名单根目录内的工作区', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'agent-allowed-'));
    const allowed = path.join(parent, 'allowed');
    const denied = path.join(parent, 'denied');
    cleanup.push(parent);
    await mkdir(allowed);
    await mkdir(denied);
    await expect(assertAllowedWorkspaceRoot(allowed, [parent])).resolves.toBe(
      await realpath(allowed),
    );
    await expect(assertAllowedWorkspaceRoot(denied, [allowed])).rejects.toBeInstanceOf(
      PathEscapeError,
    );
  });

  it('白名单为空时返回可操作的配置错误', async () => {
    await expect(assertAllowedWorkspaceRoot('/tmp/example', [])).rejects.toBeInstanceOf(
      WorkspaceRootsNotConfiguredError,
    );
  });
});
