import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { GrepToolInputSchema, type GrepToolInput } from '@ai-engine/contracts';
import { relativeResource, resolveWorkspacePath } from '../workspace-path';
import { assertPreparedPath, type AgentTool, type PreparedTool, type ToolContext } from './tool';
import { truncateToolOutput } from './tool-output';

const runRipgrep = (
  pattern: string,
  target: string,
  cwd: string,
  signal: AbortSignal,
  excludeSensitive: boolean,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const exclusions = excludeSensitive
      ? ['--glob', '!**/.env', '--glob', '!**/.env.*', '--glob', '!**/*.key', '--glob', '!**/*.pem']
      : [];
    execFile(
      'rg',
      [
        '--line-number',
        '--color',
        'never',
        '--max-count',
        '50',
        '--glob',
        '!node_modules/**',
        '--glob',
        '!.git/**',
        ...exclusions,
        '--',
        pattern,
        target,
      ],
      { cwd, encoding: 'utf8', maxBuffer: 100 * 1024, shell: false, signal },
      (error, stdout) => {
        if (!error || ('code' in error && error.code === 1)) {
          resolve(stdout);
          return;
        }
        if ('code' in error && error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          resolve(`${stdout}\n[搜索结果已截断]`);
          return;
        }
        reject(error instanceof Error ? error : new Error('ripgrep 执行失败'));
      },
    );
  });

export class GrepTool implements AgentTool<GrepToolInput, string> {
  readonly name = 'grep' as const;
  readonly permission = 'read' as const;
  readonly input = GrepToolInputSchema;
  readonly description = '用文本模式搜索工作区文件内容。参数会直接传给 ripgrep，不执行 shell。';

  async prepare(input: GrepToolInput, context: ToolContext) {
    const root = await resolveWorkspacePath(context.workspaceRoot, '.');
    const target = await resolveWorkspacePath(root, input.path ?? '.');
    const excludeSensitive = (await stat(target)).isDirectory();
    return {
      resource: (await relativeResource(root, target)) || '.',
      absolutePath: target,
      workspacePath: root,
      excludeSensitive,
    };
  }

  async execute(
    input: GrepToolInput,
    context: ToolContext,
    prepared?: PreparedTool,
  ): Promise<string> {
    const root = await resolveWorkspacePath(context.workspaceRoot, '.');
    if (prepared?.workspacePath && prepared.workspacePath !== root) {
      throw new Error('工作区路径在权限检查后发生变化，请重新发起工具调用');
    }
    const target = await resolveWorkspacePath(root, input.path ?? '.');
    assertPreparedPath(prepared, target);
    const excludeSensitive = prepared?.excludeSensitive ?? (await stat(target)).isDirectory();
    return runRipgrep(input.pattern, target, root, context.signal, excludeSensitive);
  }

  toModelOutput(output: string): string {
    return truncateToolOutput(output || '没有匹配结果');
  }
}
