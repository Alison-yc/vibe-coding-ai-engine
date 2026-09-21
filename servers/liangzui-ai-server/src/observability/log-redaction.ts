import { createHash } from 'node:crypto';

const PREVIEW_MAX = 100;

export const summarizeText = (text: string): { length: number; preview: string; hash: string } => {
  const preview = text.length <= PREVIEW_MAX ? text : `${text.slice(0, PREVIEW_MAX)}…`;
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
  return { length: text.length, preview, hash };
};

export const redactRequestBody = (body: unknown): unknown => {
  if (typeof body !== 'object' || body === null) {
    return typeof body === 'string' ? summarizeText(body) : body;
  }
  if (Array.isArray(body)) {
    return body.map((item) => redactRequestBody(item));
  }
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, summarizeText(value)];
      }
      return [key, redactRequestBody(value)];
    }),
  );
};
