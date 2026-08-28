import { access, chmod, cp, lstat, mkdir, rm } from 'node:fs/promises';
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

runPnpm(['--filter', 'liangzui-ai-server...', 'build']);
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
const rustArchitecture = rustHost.split('-')[0];
const nodeArchitecture =
  process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : process.arch;
if (rustArchitecture !== nodeArchitecture) {
  throw new Error(`Node 架构 ${process.arch} 与 Rust target ${rustHost} 不匹配`);
}
await cp(process.execPath, sidecarBinary, { dereference: true });
await chmod(sidecarBinary, 0o755);

const requiredFiles = [
  path.join(serverBundleDirectory, 'dist/main.js'),
  path.join(serverBundleDirectory, 'drizzle/meta/_journal.json'),
  path.join(serverBundleDirectory, 'mcp.json.example'),
  path.join(serverBundleDirectory, 'node_modules/@ai-engine/contracts/dist/index.js'),
];
await Promise.all(requiredFiles.map((file) => access(file)));
if ((await lstat(sidecarBinary)).isSymbolicLink()) {
  throw new Error('sidecar Node runtime 不能是符号链接');
}

log(`sidecar 已准备：${path.relative(repositoryRoot, sidecarBinary)}`);
