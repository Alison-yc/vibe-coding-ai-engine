import { z } from 'zod';

export const ReadToolInputSchema = z.object({
  path: z.string().min(1).max(4096),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(2000).optional(),
});

export const WriteToolInputSchema = z.object({
  path: z.string().min(1).max(4096),
  content: z.string().max(1_000_000),
});

export const EditToolInputSchema = z.object({
  path: z.string().min(1).max(4096),
  oldString: z.string().min(1).max(200_000),
  newString: z.string().max(200_000),
});

export const GlobToolInputSchema = z.object({
  pattern: z.string().min(1).max(1000),
});

export const GrepToolInputSchema = z.object({
  pattern: z.string().min(1).max(4000),
  path: z.string().min(1).max(4096).optional(),
});

export const DatetimeToolInputSchema = z.object({
  timezone: z.string().min(1).max(100).optional(),
});

export const CalculateToolInputSchema = z.object({
  expression: z.string().min(1).max(256),
});

export const GenerateUuidToolInputSchema = z.object({
  count: z.number().int().min(1).max(10).optional(),
});

export type ReadToolInput = z.infer<typeof ReadToolInputSchema>;
export type WriteToolInput = z.infer<typeof WriteToolInputSchema>;
export type EditToolInput = z.infer<typeof EditToolInputSchema>;
export type GlobToolInput = z.infer<typeof GlobToolInputSchema>;
export type GrepToolInput = z.infer<typeof GrepToolInputSchema>;
export type DatetimeToolInput = z.infer<typeof DatetimeToolInputSchema>;
export type CalculateToolInput = z.infer<typeof CalculateToolInputSchema>;
export type GenerateUuidToolInput = z.infer<typeof GenerateUuidToolInputSchema>;
