import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.pdf']);

export class EmptyPdfTextError extends Error {
  constructor() {
    super('PDF 没有可提取的文本层，可能是扫描件。请改用带文字层的 PDF 或 Markdown。');
    this.name = 'EmptyPdfTextError';
  }
}

export class UnsupportedDocumentTypeError extends Error {
  constructor(filename: string) {
    super(`不支持的文件类型：${filename}。仅支持 txt、md、pdf。`);
    this.name = 'UnsupportedDocumentTypeError';
  }
}

export const safeDocumentName = (filename: string): string => {
  const base = path.basename(filename).replaceAll('\0', '');
  if (!base || base === '.' || base === '..') {
    throw new UnsupportedDocumentTypeError(filename);
  }
  return base;
};

export const extractDocumentText = async (filename: string, bytes: Uint8Array): Promise<string> => {
  const name = safeDocumentName(filename);
  const extension = path.extname(name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new UnsupportedDocumentTypeError(name);
  }
  if (extension === '.pdf') {
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    const raw: unknown = extracted.text;
    const text = Array.isArray(raw)
      ? raw.map((page) => (typeof page === 'string' ? page : '')).join('\n')
      : typeof raw === 'string'
        ? raw
        : '';
    if (text.trim().length === 0) throw new EmptyPdfTextError();
    return text;
  }
  return new TextDecoder('utf-8').decode(bytes);
};
