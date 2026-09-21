import { readFile, writeFile } from 'node:fs/promises';
import { EditToolInputSchema, type EditToolInput } from '@ai-engine/contracts';
import { relativeResource, resolveWorkspacePath } from '../workspace-path';
import { assertPreparedPath, type AgentTool, type PreparedTool, type ToolContext } from './tool';
import { truncateDiff } from './tool-output';

const replacement = (content: string, oldString: string, newString: string): string => {
  const matches = content.split(oldString).length - 1;
  if (matches !== 1) {
    throw new Error(`精确编辑需要 oldString 唯一匹配，当前找到 ${matches} 处；请提供更多上下文`);
  }
  return content.replace(oldString, newString);
};

export class EditTool implements AgentTool<EditToolInput, { bytesWritten: number }> {
  readonly name = 'edit' as const;
  readonly permission = 'write' as const;
  readonly input = EditToolInputSchema;
  readonly description =
    '精确替换工作区文件中的唯一文本。必须先 read，并提供足够上下文确保 oldString 只出现一次。';

  async prepare(input: EditToolInput, context: ToolContext) {
    const target = await resolveWorkspacePath(context.workspaceRoot, input.path);
    const content = await readFile(target, 'utf8');
    replacement(content, input.oldString, input.newString);
    return {
      resource: await relativeResource(context.workspaceRoot, target),
      diff: truncateDiff(`--- 原片段\n+++ 新片段\n-${input.oldString}\n+${input.newString}`),
      absolutePath: target,
    };
  }

  async execute(input: EditToolInput, context: ToolContext, prepared?: PreparedTool) {
    const target = await resolveWorkspacePath(context.workspaceRoot, input.path);
    assertPreparedPath(prepared, target);
    const content = await readFile(target, 'utf8');
    const next = replacement(content, input.oldString, input.newString);
    await writeFile(target, next, { encoding: 'utf8', signal: context.signal });
    return { bytesWritten: Buffer.byteLength(next) };
  }

  toModelOutput(output: { bytesWritten: number }): string {
    return `编辑成功，文件当前 ${output.bytesWritten} 字节`;
  }
}
