import { UuidSchema } from '@ai-engine/contracts';
import { describe, expect, it } from 'vitest';
import { CalculateTool, evaluateArithmetic } from './calculate.tool';
import { DatetimeTool } from './datetime.tool';
import { GenerateUuidTool } from './generate-uuid.tool';

const context = {
  workspaceRoot: '/unused',
  signal: new AbortController().signal,
};

describe('agent utility tools', () => {
  it('datetime 按指定 IANA 时区返回稳定的日期时间与 UTC 偏移', async () => {
    const tool = new DatetimeTool(() => new Date('2026-08-28T00:30:45.000Z'));
    const output = await tool.execute({ timezone: 'Asia/Shanghai' }, context);

    expect(output).toEqual({
      timezone: 'Asia/Shanghai',
      date: '2026-08-28',
      time: '08:30:45',
      weekday: '星期五',
      utcOffset: 'UTC+08:00',
    });
    expect(tool.toModelOutput(output)).toContain('2026-08-28 08:30:45');
    await expect(tool.prepare({ timezone: 'Not/A_Timezone' })).rejects.toThrow('无效的 IANA 时区');
  });

  it('calculate 支持优先级、括号、幂与一元负号', async () => {
    expect(evaluateArithmetic('2 + 3 * (4 - 1)')).toBe(11);
    expect(evaluateArithmetic('2 ^ 3 ^ 2')).toBe(512);
    expect(evaluateArithmetic('-2 ^ 2')).toBe(-4);
    await expect(new CalculateTool().execute({ expression: '10 % 4' }, context)).resolves.toBe(2);
  });

  it('calculate 拒绝代码、非法表达式、非有限结果和过深括号', () => {
    expect(() => evaluateArithmetic('process.exit()')).toThrow('算术表达式无效');
    expect(() => evaluateArithmetic('1 / 0')).toThrow('不是有限数值');
    expect(() => evaluateArithmetic('('.repeat(33) + '1' + ')'.repeat(33))).toThrow(
      '不能超过 32 层',
    );
  });

  it('generate_uuid 生成指定数量的 UUID v4', async () => {
    const output = await new GenerateUuidTool().execute({ count: 3 }, context);
    expect(output).toHaveLength(3);
    expect(output.every((value) => UuidSchema.safeParse(value).success)).toBe(true);
    expect(new Set(output).size).toBe(3);
  });
});
