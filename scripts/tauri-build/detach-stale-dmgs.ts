import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** create-dmg 中途失败会留下可写临时镜像，文件名形如 rw.<pid>.liangzui-ai-app_<version>_aarch64.dmg */
const STALE_RW_DMG = /\/rw\.\d+\.liangzui-ai-app_[^/\s]+\.dmg$/;

export const STALE_RW_DMG_BASENAME = /^rw\.\d+\.liangzui-ai-app_[^/]+\.dmg$/;

export const isStaleTauriDmgImage = (imagePath: string): boolean =>
  STALE_RW_DMG.test(imagePath.replaceAll('\\', '/'));

export const parseStaleDmgDevices = (hdiutilInfo: string): string[] => {
  const devices: string[] = [];
  for (const block of hdiutilInfo.split(/^=+$/m)) {
    const imagePath = block.match(/image-path\s*:\s*(.+)/)?.[1]?.trim();
    if (!imagePath || !isStaleTauriDmgImage(imagePath)) continue;
    const device = block.match(/\/dev\/disk\d+(?!s)/)?.[0];
    if (device) devices.push(device);
  }
  return [...new Set(devices)];
};

export const detachStaleTauriDmgs = (
  platform = process.platform,
  run: (command: string, args: string[]) => string = (command, args) =>
    execFileSync(command, args, { encoding: 'utf8' }),
): string[] => {
  if (platform !== 'darwin') return [];
  const devices = parseStaleDmgDevices(run('hdiutil', ['info']));
  for (const device of devices) {
    run('hdiutil', ['detach', '-force', device]);
  }
  return devices;
};

/** 删除 macos bundle 目录内残留的 rw 临时 dmg（勿删已挂载文件）。 */
export const removeStaleRwDmgFilesInMacosBundle = (
  macosBundleDir: string,
  deps: {
    exists?: (p: string) => boolean;
    readdir?: (p: string) => string[];
    unlink?: (p: string) => void;
  } = {},
): string[] => {
  const exists = deps.exists ?? fs.existsSync;
  const readdir = deps.readdir ?? fs.readdirSync;
  const unlink = deps.unlink ?? fs.unlinkSync;
  if (!exists(macosBundleDir)) return [];
  const removed: string[] = [];
  for (const name of readdir(macosBundleDir)) {
    if (!STALE_RW_DMG_BASENAME.test(name)) continue;
    const fullPath = path.join(macosBundleDir, name);
    try {
      unlink(fullPath);
      removed.push(fullPath);
    } catch {
      // 仍被 hdiutil 占用时跳过，避免打断打包前清理。
    }
  }
  return removed;
};

export const prepareTauriDmgBuild = (
  macosBundleDir: string,
  platform = process.platform,
  run: (command: string, args: string[]) => string = (command, args) =>
    execFileSync(command, args, { encoding: 'utf8' }),
): { detached: string[]; removed: string[] } => {
  const detached = detachStaleTauriDmgs(platform, run);
  const removed = platform === 'darwin' ? removeStaleRwDmgFilesInMacosBundle(macosBundleDir) : [];
  return { detached, removed };
};
