import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import packageJson from '../../package.json' with { type: 'json' };
import { resolveTauriBuildVersion } from './version.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
if (typeof packageJson.version !== 'string') {
  throw new Error('根 package.json 缺少有效 version');
}

const version = resolveTauriBuildVersion(packageJson.version, process.env);
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('无法定位 pnpm CLI，请通过 pnpm 运行此脚本');

process.stdout.write(`构建应用版本：${version}\n`);
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
