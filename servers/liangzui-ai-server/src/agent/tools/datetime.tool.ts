import { DatetimeToolInputSchema, type DatetimeToolInput } from '@ai-engine/contracts';
import type { AgentTool, ToolContext } from './tool';

type DatetimeOutput = {
  timezone: string;
  date: string;
  time: string;
  weekday: string;
  utcOffset: string;
};

const partValue = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string =>
  parts.find((part) => part.type === type)?.value ?? '';

export class DatetimeTool implements AgentTool<DatetimeToolInput, DatetimeOutput> {
  readonly name = 'datetime' as const;
  readonly permission = 'read' as const;
  readonly input = DatetimeToolInputSchema;
  readonly description =
    '查询当前日期、时间、星期和 UTC 偏移。timezone 使用 IANA 时区，如 Asia/Shanghai；不要用于天气查询。';

  constructor(private readonly now: () => Date = () => new Date()) {}

  prepare(input: DatetimeToolInput) {
    return Promise.resolve().then(() => {
      const timezone = input.timezone ?? 'Asia/Shanghai';
      this.formatter(timezone);
      return { resource: `timezone:${timezone}` };
    });
  }

  execute(input: DatetimeToolInput, _context: ToolContext): Promise<DatetimeOutput> {
    const timezone = input.timezone ?? 'Asia/Shanghai';
    const parts = this.formatter(timezone).formatToParts(this.now());
    return Promise.resolve({
      timezone,
      date: `${partValue(parts, 'year')}-${partValue(parts, 'month')}-${partValue(parts, 'day')}`,
      time: `${partValue(parts, 'hour')}:${partValue(parts, 'minute')}:${partValue(parts, 'second')}`,
      weekday: partValue(parts, 'weekday'),
      utcOffset: partValue(parts, 'timeZoneName').replace('GMT', 'UTC'),
    });
  }

  toModelOutput(output: DatetimeOutput): string {
    return `${output.date} ${output.time} ${output.weekday}（${output.timezone}，${output.utcOffset}）`;
  }

  private formatter(timezone: string): Intl.DateTimeFormat {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        timeZoneName: 'longOffset',
      });
    } catch {
      throw new Error(`无效的 IANA 时区：${timezone}`);
    }
  }
}
