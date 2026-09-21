import { describe, expect, it } from 'vitest';
import {
  detachStaleTauriDmgs,
  isStaleTauriDmgImage,
  parseStaleDmgDevices,
  removeStaleRwDmgFilesInMacosBundle,
  STALE_RW_DMG_BASENAME,
} from './detach-stale-dmgs';

const HDIUTIL_INFO = `
================================================
image-path      : /private/var/folders/tmp/cargo-target/release/bundle/macos/rw.23796.liangzui-ai-app_0.1.0_aarch64.dmg
/dev/disk4	GUID_partition_scheme	
/dev/disk4s1	48465300-0000-11AA-AA11-00306543ECAC	/Volumes/dmg.y49V5o
================================================
image-path      : /Users/mac/Downloads/liangzui-ai-app_0.1.20260901131949_aarch64.dmg
/dev/disk7	GUID_partition_scheme	
/dev/disk7s1	48465300-0000-11AA-AA11-00306543ECAC	/Volumes/liangzui-ai-app
================================================
image-path      : /Users/mac/Desktop/AI-Engine/clients/liangzui-ai-app/src-tauri/target/release/bundle/macos/rw.4449.liangzui-ai-app_0.1.20260901131949_aarch64.dmg
/dev/disk6	GUID_partition_scheme	
/dev/disk6s1	48465300-0000-11AA-AA11-00306543ECAC	/Volumes/dmg.tqYdoD
`;

describe('isStaleTauriDmgImage', () => {
  it('只识别 create-dmg 残留的可写临时镜像', () => {
    expect(
      isStaleTauriDmgImage(
        '/repo/clients/liangzui-ai-app/src-tauri/target/release/bundle/macos/rw.4449.liangzui-ai-app_0.1.20260901131949_aarch64.dmg',
      ),
    ).toBe(true);
    expect(
      isStaleTauriDmgImage('/Users/mac/Downloads/liangzui-ai-app_0.1.20260901131949_aarch64.dmg'),
    ).toBe(false);
  });
});

describe('parseStaleDmgDevices', () => {
  it('只卸载临时 rw 镜像对应的整盘设备', () => {
    expect(parseStaleDmgDevices(HDIUTIL_INFO)).toEqual(['/dev/disk4', '/dev/disk6']);
  });
});

describe('STALE_RW_DMG_BASENAME', () => {
  it('匹配 bundle/macos 下的临时文件名', () => {
    expect(
      STALE_RW_DMG_BASENAME.test('rw.99823.liangzui-ai-app_0.1.20260921112253_aarch64.dmg'),
    ).toBe(true);
    expect(STALE_RW_DMG_BASENAME.test('liangzui-ai-app.app')).toBe(false);
  });
});

describe('removeStaleRwDmgFilesInMacosBundle', () => {
  it('只删除 rw 临时 dmg', () => {
    const unlinked: string[] = [];
    const removed = removeStaleRwDmgFilesInMacosBundle('/bundle/macos', {
      exists: () => true,
      readdir: () => ['liangzui-ai-app.app', 'rw.1.liangzui-ai-app_0.1.0_aarch64.dmg', '.DS_Store'],
      unlink: (p) => {
        unlinked.push(p);
      },
    });
    expect(removed).toEqual(['/bundle/macos/rw.1.liangzui-ai-app_0.1.0_aarch64.dmg']);
    expect(unlinked).toEqual(['/bundle/macos/rw.1.liangzui-ai-app_0.1.0_aarch64.dmg']);
  });
});

describe('detachStaleTauriDmgs', () => {
  it('非 macOS 不调用 hdiutil', () => {
    const calls: string[][] = [];
    expect(
      detachStaleTauriDmgs('linux', (_command, args) => {
        calls.push(args);
        return '';
      }),
    ).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('按解析结果强制卸载残留镜像', () => {
    const calls: string[][] = [];
    expect(
      detachStaleTauriDmgs('darwin', (_command, args) => {
        calls.push(args);
        return args[0] === 'info' ? HDIUTIL_INFO : '';
      }),
    ).toEqual(['/dev/disk4', '/dev/disk6']);
    expect(calls).toEqual([
      ['info'],
      ['detach', '-force', '/dev/disk4'],
      ['detach', '-force', '/dev/disk6'],
    ]);
  });
});
