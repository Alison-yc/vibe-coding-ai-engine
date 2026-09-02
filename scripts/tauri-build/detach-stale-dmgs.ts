import { execFileSync } from 'node:child_process';

/** create-dmg 中途失败会留下可写临时镜像，文件名形如 rw.<pid>.liangzui-ai-app_<version>_aarch64.dmg */
const STALE_RW_DMG = /\/rw\.\d+\.liangzui-ai-app_[^/\s]+\.dmg$/;

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
