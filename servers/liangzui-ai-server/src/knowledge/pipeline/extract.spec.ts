import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyPdfTextError, extractDocumentText, safeDocumentName } from './extract';

const getDocumentProxy = vi.fn();
const extractText = vi.fn();

vi.mock('unpdf', () => ({
  getDocumentProxy: (...args: unknown[]) => getDocumentProxy(...args),
  extractText: (...args: unknown[]) => extractText(...args),
}));

describe('extractDocumentText pdf', () => {
  beforeEach(() => {
    getDocumentProxy.mockReset();
    extractText.mockReset();
  });

  it('空文本层抛出扫描件错误', async () => {
    getDocumentProxy.mockResolvedValue({});
    extractText.mockResolvedValue({ text: '   ' });
    await expect(extractDocumentText('scan.pdf', new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      EmptyPdfTextError,
    );
  });

  it('合并多页文本', async () => {
    getDocumentProxy.mockResolvedValue({});
    extractText.mockResolvedValue({ text: ['第一页', '第二页'] });
    await expect(extractDocumentText('doc.pdf', new Uint8Array([1]))).resolves.toBe(
      '第一页\n第二页',
    );
  });

  it('拒绝空文件名', async () => {
    expect(() => safeDocumentName('.')).toThrow('不支持的文件类型');
  });
});
