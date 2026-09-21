import fs from 'node:fs/promises';
import path from 'node:path';

export class PathEscapeError extends Error {
  constructor(userPath: string) {
    super(`路径逃逸：${userPath}`);
    this.name = 'PathEscapeError';
  }
}

export const resolveExistingRepoFile = async (
  repoRoot: string,
  userPath: string,
): Promise<string> => {
  const realRoot = await fs.realpath(repoRoot);
  const resolved = path.resolve(realRoot, userPath);
  const realPath = await fs.realpath(resolved);
  if (realPath !== realRoot && !realPath.startsWith(realRoot + path.sep)) {
    throw new PathEscapeError(userPath);
  }
  return realPath;
};

export const resolveRepoOutputFile = async (
  repoRoot: string,
  userPath: string,
): Promise<string> => {
  const realRoot = await fs.realpath(repoRoot);
  const resolved = path.resolve(realRoot, userPath);
  const realDir = await fs.realpath(path.dirname(resolved));
  if (realDir !== realRoot && !realDir.startsWith(realRoot + path.sep)) {
    throw new PathEscapeError(userPath);
  }
  return path.join(realDir, path.basename(resolved));
};

export const toRepoRelative = (repoRoot: string, absolutePath: string): string =>
  path.relative(repoRoot, absolutePath).split(path.sep).join('/');
