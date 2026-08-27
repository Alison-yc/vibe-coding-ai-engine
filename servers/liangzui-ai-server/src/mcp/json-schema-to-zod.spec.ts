import { describe, expect, it } from 'vitest';
import { jsonSchemaToZod } from './json-schema-to-zod';

describe('jsonSchemaToZod', () => {
  it('按 required 与类型校验扁平参数', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { path: { type: 'string' }, n: { type: 'number' } },
      required: ['path'],
    });
    expect(schema.parse({ path: 'a.ts', n: 1, extra: true })).toEqual({
      path: 'a.ts',
      n: 1,
      extra: true,
    });
    expect(() => schema.parse({ n: 1 })).toThrow();
  });

  it('没有 properties 时接受任意对象', () => {
    expect(jsonSchemaToZod({ type: 'object' }).parse({ a: 1 })).toEqual({ a: 1 });
  });

  it('覆盖常见 JSON Schema 标量类型', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        flag: { type: 'boolean' },
        items: { type: 'array' },
        nested: { type: 'object' },
        count: { type: 'integer' },
      },
      required: ['flag'],
    });
    expect(schema.parse({ flag: true, items: [1], nested: { a: 1 }, count: 2 })).toEqual({
      flag: true,
      items: [1],
      nested: { a: 1 },
      count: 2,
    });
  });
});
