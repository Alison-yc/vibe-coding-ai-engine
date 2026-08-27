import { z } from 'zod';

const primitive = (type: unknown): z.ZodType<unknown> => {
  if (type === 'number' || type === 'integer') return z.number();
  if (type === 'boolean') return z.boolean();
  if (type === 'array') return z.array(z.unknown());
  if (type === 'object') return z.record(z.string(), z.unknown());
  return z.string();
};

export const jsonSchemaToZod = (
  schema: Record<string, unknown>,
): z.ZodType<Record<string, unknown>> => {
  const properties =
    schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, { type?: string }>)
      : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  const keys = Object.keys(properties);
  if (keys.length === 0) return z.record(z.string(), z.unknown());
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const key of keys) {
    const field = primitive(properties[key]?.type);
    shape[key] = required.has(key) ? field : field.optional();
  }
  return z.object(shape).passthrough();
};
