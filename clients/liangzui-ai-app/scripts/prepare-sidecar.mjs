import { cp, mkdir, rm, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { log } from 'node:console';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, '..');
const repositoryRoot = path.resolve(appDirectory, '../..');
const tauriDirectory = path.join(appDirectory, 'src-tauri');
const serverDirectory = path.join(repositoryRoot, 'servers/liangzui-ai-server');
const serverBundleDirectory = path.join(tauriDirectory, 'sidecar/server');
const binariesDirectory = path.join(tauriDirectory, 'binaries');

const runPnpm = (args) => {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error('无法定位 pnpm CLI，请通过 pnpm 运行此脚本');
  execFileSync(process.execPath, [pnpmCli, ...args], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
};

const rustHost = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
  .split('\n')
  .find((line) => line.startsWith('host: '))
  ?.slice('host: '.length)
  .trim();
if (!rustHost) throw new Error('无法从 rustc -vV 读取目标三元组');

await rm(serverBundleDirectory, { recursive: true, force: true });
await mkdir(serverBundleDirectory, { recursive: true });
await mkdir(binariesDirectory, { recursive: true });

runPnpm(['--filter', 'liangzui-ai-server', 'build']);
runPnpm([
  '--config.node-linker=hoisted',
  '--filter',
  'liangzui-ai-server',
  'deploy',
  '--prod',
  serverBundleDirectory,
]);

await cp(path.join(serverDirectory, 'dist'), path.join(serverBundleDirectory, 'dist'), {
  recursive: true,
});

await Promise.all(
  [
    'src',
    'test',
    'mcp.json',
    'README.md',
    'nest-cli.json',
    'tsconfig.json',
    'tsconfig.build.json',
  ].map((entry) => rm(path.join(serverBundleDirectory, entry), { recursive: true, force: true })),
);

const sidecarBinary = path.join(binariesDirectory, `node-${rustHost}`);
await cp(process.execPath, sidecarBinary);
await chmod(sidecarBinary, 0o755);

log(`sidecar 已准备：${path.relative(repositoryRoot, sidecarBinary)}`);
