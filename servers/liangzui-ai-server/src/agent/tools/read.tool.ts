import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { ReadToolInputSchema, type ReadToolInput } from '@ai-engine/contracts';
import { relativeResource, resolveWorkspacePath } from '../workspace-path';
import { assertPreparedPath, type AgentTool, type PreparedTool, type ToolContext } from './tool';
import { truncateToolOutput } from './tool-output';

type ReadOutput = {
  content: string;
  truncated: boolean;
};

export class ReadTool implements AgentTool<ReadToolInput, ReadOutput> {
  readonly name = 'read' as const;
  readonly permission = 'read' as const;
  readonly input = ReadToolInputSchema;
  readonly description =
    '读取工作区内的文本文件。分析或编辑文件前必须先调用 read；不要用于目录或工作区外路径。';

  async prepare(input: ReadToolInput, context: ToolContext) {
    const target = await resolveWorkspacePath(context.workspaceRoot, input.path);
    return {
      resource: await relativeResource(context.workspaceRoot, target),
      absolutePath: target,
    };
  }

  async execute(
    input: ReadToolInput,
    context: ToolContext,
    prepared?: PreparedTool,
  ): Promise<ReadOutput> {
    const target = await resolveWorkspacePath(context.workspaceRoot, input.path);
    assertPreparedPath(prepared, target);
    const offset = input.offset ?? 0;
    const limit = Math.min(input.limit ?? 2000, 2000);
    const stream = createReadStream(target, { encoding: 'utf8', signal: context.signal });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    const selected: string[] = [];
    let index = 0;
    let truncated = false;
    try {
      for await (const line of lines) {
        if (index >= offset && selected.length < limit) {
          selected.push(`${index + 1}|${line}`);
          if (Buffer.byteLength(selected.join('\n')) > 50 * 1024) {
            selected.pop();
            truncated = true;
            break;
          }
        } else if (selected.length >= limit) {
          truncated = true;
          break;
        }
        index += 1;
      }
    } finally {
      lines.close();
      stream.destroy();
    }
    return { content: selected.join('\n'), truncated };
  }

  toModelOutput(output: ReadOutput): string {
    return truncateToolOutput(
      `${output.content}${output.truncated ? '\n[内容已截断，请用 offset/limit 继续读取]' : ''}`,
    );
  }
}
