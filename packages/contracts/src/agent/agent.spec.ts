import { describe, expect, it } from 'vitest';
import {
  AgentModelRequestSchema,
  AgentStreamEventSchema,
  AgentStreamRequestSchema,
  CalculateToolInputSchema,
  DatetimeToolInputSchema,
  EditToolInputSchema,
  GenerateUuidToolInputSchema,
  PermissionResponseRequestSchema,
} from './index.js';

describe('Agent contracts', () => {
  it('限制同时暴露给模型的工具数量不超过六个', () => {
    const tools = Array.from({ length: 7 }, (_, index) => ({
      name: 'read',
      description: `工具 ${index}`,
      inputSchema: {},
    }));
    expect(
      AgentModelRequestSchema.safeParse({
        messages: [{ role: 'user', content: '读取文件' }],
        tools,
      }).success,
    ).toBe(false);
  });

  it('拒绝缺少工作区的 Agent 请求', () => {
    expect(AgentStreamRequestSchema.safeParse({ content: '读取文件', mode: 'edit' }).success).toBe(
      false,
    );
  });

  it('校验审批决定与精确编辑参数', () => {
    expect(PermissionResponseRequestSchema.safeParse({ decision: 'allow-session' }).success).toBe(
      true,
    );
    expect(
      EditToolInputSchema.safeParse({ path: 'a.ts', oldString: '', newString: 'x' }).success,
    ).toBe(false);
  });

  it('校验通用工具的扁平参数与数量边界', () => {
    expect(DatetimeToolInputSchema.parse({})).toEqual({});
    expect(CalculateToolInputSchema.safeParse({ expression: '2 * (3 + 4)' }).success).toBe(true);
    expect(CalculateToolInputSchema.safeParse({ expression: 'x'.repeat(257) }).success).toBe(false);
    expect(GenerateUuidToolInputSchema.parse({})).toEqual({});
    expect(GenerateUuidToolInputSchema.safeParse({ count: 11 }).success).toBe(false);
  });

  it('允许带 server 前缀的 MCP 工具名', () => {
    expect(
      AgentModelRequestSchema.safeParse({
        messages: [{ role: 'user', content: '列出文件' }],
        tools: [
          {
            name: 'filesystem__read_file',
            description: 'MCP 读取',
            inputSchema: { type: 'object' },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('校验审批 SSE 事件', () => {
    expect(
      AgentStreamEventSchema.safeParse({
        event: 'permission.asked',
        data: {
          id: crypto.randomUUID(),
          sessionId: crypto.randomUUID(),
          toolCallId: 'call-1',
          tool: 'write',
          resource: 'README.md',
          diff: '+内容',
        },
      }).success,
    ).toBe(true);
  });
});
