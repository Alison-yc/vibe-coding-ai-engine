import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import packageJson from '../../package.json' with { type: 'json' };
import { prepareTauriDmgBuild } from './detach-stale-dmgs.js';
import { resolveTauriBuildVersion } from './version.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
if (typeof packageJson.version !== 'string') {
  throw new Error('根 package.json 缺少有效 version');
}

const version = resolveTauriBuildVersion(packageJson.version, process.env);
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('无法定位 pnpm CLI，请通过 pnpm 运行此脚本');

process.stdout.write(`构建应用版本：${version}\n`);
const macosBundleDir = path.join(
  repositoryRoot,
  'clients/liangzui-ai-app/src-tauri/target/release/bundle/macos',
);
const { detached, removed } = prepareTauriDmgBuild(macosBundleDir);
if (detached.length > 0) {
  process.stdout.write(`已卸载上次打包残留的磁盘镜像：${detached.join(', ')}\n`);
}
if (removed.length > 0) {
  process.stdout.write(
    `已删除 macos bundle 内 ${removed.length} 个 rw 临时 dmg（避免 create-dmg 源目录污染）\n`,
  );
}
execFileSync(
  process.execPath,
  [
    pnpmCli,
    '--filter',
    'liangzui-ai-app',
    'tauri',
    'build',
    '--config',
    JSON.stringify({ version }),
    ...process.argv.slice(2),
  ],
  {
    cwd: repositoryRoot,
    stdio: 'inherit',
  },
);
