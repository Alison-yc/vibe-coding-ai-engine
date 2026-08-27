import { readFile, writeFile } from 'node:fs/promises';
import { WriteToolInputSchema, type WriteToolInput } from '@ai-engine/contracts';
import { relativeResource, resolveWorkspacePath } from '../workspace-path';
import { assertPreparedPath, type AgentTool, type PreparedTool, type ToolContext } from './tool';
import { truncateDiff } from './tool-output';

const preview = (before: string, after: string): string =>
  truncateDiff(`--- 原内容\n+++ 新内容\n-${before}\n+${after}`);

export class WriteTool implements AgentTool<WriteToolInput, { bytesWritten: number }> {
  readonly name = 'write' as const;
  readonly permission = 'write' as const;
  readonly input = WriteToolInputSchema;
  readonly description =
    '创建或完整覆盖工作区内的文件。仅在用户要求落盘时使用；已有文件必须先 read，再调用 write。';

  async prepare(input: WriteToolInput, context: ToolContext) {
    const target = await resolveWorkspacePath(context.workspaceRoot, input.path, {
      allowMissing: true,
    });
    let targetExisted = true;
    const before = await readFile(target, 'utf8').catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        targetExisted = false;
        return '';
      }
      throw error;
    });
    return {
      resource: await relativeResource(context.workspaceRoot, target),
      diff: preview(before, input.content),
      absolutePath: target,
      targetExisted,
    };
  }

  async execute(input: WriteToolInput, context: ToolContext, prepared?: PreparedTool) {
    const target = await resolveWorkspacePath(context.workspaceRoot, input.path, {
      allowMissing: true,
    });
    assertPreparedPath(prepared, target);
    await writeFile(target, input.content, {
      encoding: 'utf8',
      signal: context.signal,
      ...(prepared?.targetExisted === false ? { flag: 'wx' } : {}),
    });
    return { bytesWritten: Buffer.byteLength(input.content) };
  }

  toModelOutput(output: { bytesWritten: number }): string {
    return `写入成功，共 ${output.bytesWritten} 字节`;
  }
}
