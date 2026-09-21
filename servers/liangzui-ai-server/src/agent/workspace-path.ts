import { realpath } from 'node:fs/promises';
import path from 'node:path';

export class PathEscapeError extends Error {
  constructor(input: string) {
    super(`路径越出工作区：${input}`);
    this.name = 'PathEscapeError';
  }
}

export class WorkspaceRootsNotConfiguredError extends Error {
  constructor() {
    super('未配置文件访问工作区白名单，请设置 AGENT_WORKSPACE_ROOTS 并重启服务');
    this.name = 'WorkspaceRootsNotConfiguredError';
  }
}

const isWithin = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative.split(path.sep).at(0) !== '..');
};

export const assertAllowedWorkspaceRoot = async (
  workspaceRoot: string,
  allowedRoots: string[],
): Promise<string> => {
  if (allowedRoots.length === 0) throw new WorkspaceRootsNotConfiguredError();
  const realWorkspace = await realpath(workspaceRoot);
  for (const allowedRoot of allowedRoots) {
    const realAllowed = await realpath(allowedRoot).catch(() => null);
    if (realAllowed && isWithin(realAllowed, realWorkspace)) return realWorkspace;
  }
  throw new PathEscapeError(workspaceRoot);
};

export const resolveWorkspacePath = async (
  workspaceRoot: string,
  input: string,
  options: { allowMissing?: boolean } = {},
): Promise<string> => {
  const realRoot = await realpath(workspaceRoot);
  const resolved = path.resolve(realRoot, input);
  let candidate: string;
  if (options.allowMissing) {
    candidate = await realpath(resolved).catch(async (error: unknown) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      return path.join(await realpath(path.dirname(resolved)), path.basename(resolved));
    });
  } else {
    candidate = await realpath(resolved);
  }
  if (!isWithin(realRoot, candidate)) throw new PathEscapeError(input);
  return candidate;
};

export const relativeResource = async (
  workspaceRoot: string,
  absolutePath: string,
): Promise<string> =>
  path
    .relative(await realpath(workspaceRoot), absolutePath)
    .split(path.sep)
    .join('/');
