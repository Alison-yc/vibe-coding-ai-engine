import { z } from 'zod';

export const TranslateRequestSchema = z.object({
  text: z.string().min(1).max(8000),
});
export type TranslateRequest = z.infer<typeof TranslateRequestSchema>;

export const TranslateResponseSchema = z.object({
  text: z.string(),
});
export type TranslateResponse = z.infer<typeof TranslateResponseSchema>;
