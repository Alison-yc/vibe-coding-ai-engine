import path from 'node:path';
import { glob } from 'tinyglobby';
import { GlobToolInputSchema, type GlobToolInput } from '@ai-engine/contracts';
import { resolveWorkspacePath } from '../workspace-path';
import { assertPreparedPath, type AgentTool, type PreparedTool, type ToolContext } from './tool';
import { truncateToolOutput } from './tool-output';

const assertSafePattern = (pattern: string): void => {
  if (path.isAbsolute(pattern) || pattern.includes('..')) {
    throw new Error('glob pattern 不得包含绝对路径或 ..');
  }
};

export class GlobTool implements AgentTool<GlobToolInput, string[]> {
  readonly name = 'glob' as const;
  readonly permission = 'read' as const;
  readonly input = GlobToolInputSchema;
  readonly description = '按文件名模式查找工作区文件。适合寻找文件，不用于搜索文件内容。';

  async prepare(input: GlobToolInput, context: ToolContext) {
    assertSafePattern(input.pattern);
    const root = await resolveWorkspacePath(context.workspaceRoot, '.');
    return { resource: input.pattern, absolutePath: root };
  }

  async execute(
    input: GlobToolInput,
    context: ToolContext,
    prepared?: PreparedTool,
  ): Promise<string[]> {
    assertSafePattern(input.pattern);
    const root = await resolveWorkspacePath(context.workspaceRoot, '.');
    assertPreparedPath(prepared, root);
    const matches = await glob(input.pattern, {
      cwd: root,
      onlyFiles: true,
      dot: true,
      followSymbolicLinks: false,
      ignore: ['**/node_modules/**', '**/.git/**', '**/.env', '**/.env.*', '**/*.key', '**/*.pem'],
    });
    await Promise.all(matches.map((match) => resolveWorkspacePath(root, match)));
    return matches;
  }

  toModelOutput(output: string[]): string {
    return truncateToolOutput(
      `${output.slice(0, 1000).join('\n')}${output.length > 1000 ? '\n[结果已截断为 1000 条]' : ''}`,
    );
  }
}
