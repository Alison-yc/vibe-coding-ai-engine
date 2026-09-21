import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeController } from './knowledge.controller';
import { EmptyPdfTextError, UnsupportedDocumentTypeError } from './pipeline/extract';

describe('KnowledgeController', () => {
  it('把 NOT_FOUND 映射为 404', async () => {
    const knowledge = {
      getDataset: vi.fn().mockRejectedValue(new Error('NOT_FOUND:知识库不存在')),
    };
    const controller = new KnowledgeController(knowledge as never);
    await expect(
      controller.getDataset('00000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('缺少上传文件时 400', () => {
    const controller = new KnowledgeController({} as never);
    expect(() =>
      controller.uploadDocument('00000000-0000-4000-8000-000000000001', undefined),
    ).toThrow(BadRequestException);
  });

  it('空 PDF 错误映射为 400', async () => {
    const knowledge = {
      createUploadDocument: vi.fn().mockRejectedValue(new EmptyPdfTextError()),
    };
    const controller = new KnowledgeController(knowledge as never);
    await expect(
      controller.uploadDocument('00000000-0000-4000-8000-000000000001', {
        originalname: 'scan.pdf',
        buffer: Buffer.from('x'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('不支持的类型映射为 400', async () => {
    const knowledge = {
      createUploadDocument: vi.fn().mockRejectedValue(new UnsupportedDocumentTypeError('a.docx')),
    };
    const controller = new KnowledgeController(knowledge as never);
    await expect(
      controller.uploadDocument('00000000-0000-4000-8000-000000000001', {
        originalname: 'a.docx',
        buffer: Buffer.from('x'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('其它错误原样抛出', async () => {
    const knowledge = {
      getDocument: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const controller = new KnowledgeController(knowledge as never);
    await expect(controller.getDocument('00000000-0000-4000-8000-000000000001')).rejects.toThrow(
      'boom',
    );
  });

  it('转发 CRUD 与检索成功路径', async () => {
    const knowledge = {
      createDataset: vi.fn().mockResolvedValue({ id: 'd' }),
      listDatasets: vi.fn().mockResolvedValue([]),
      getDataset: vi.fn().mockResolvedValue({ id: 'd' }),
      deleteDataset: vi.fn().mockResolvedValue(undefined),
      listDocuments: vi.fn().mockResolvedValue([]),
      createPasteDocument: vi.fn().mockResolvedValue({ id: 'doc' }),
      getDocument: vi.fn().mockResolvedValue({ id: 'doc' }),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
      reindex: vi.fn().mockResolvedValue({ id: 'doc' }),
      previewSplit: vi.fn().mockReturnValue({ chunks: [] }),
      retrieve: vi.fn().mockResolvedValue({ hits: [] }),
      answer: vi.fn().mockResolvedValue({ answer: '资料中没有相关信息', citations: [] }),
    };
    const controller = new KnowledgeController(knowledge as never);
    const id = '00000000-0000-4000-8000-000000000001';
    await expect(controller.createDataset({ name: '库' })).resolves.toEqual({ id: 'd' });
    await expect(controller.listDatasets()).resolves.toEqual([]);
    await expect(controller.getDataset(id)).resolves.toEqual({ id: 'd' });
    await expect(controller.deleteDataset(id)).resolves.toBeUndefined();
    await expect(controller.listDocuments(id)).resolves.toEqual([]);
    await expect(controller.createPasteDocument(id, { name: 'a.md', text: 'x' })).resolves.toEqual({
      id: 'doc',
    });
    await expect(controller.getDocument(id)).resolves.toEqual({ id: 'doc' });
    await expect(controller.deleteDocument(id)).resolves.toBeUndefined();
    await expect(controller.reindex(id)).resolves.toEqual({ id: 'doc' });
    await expect(controller.splitPreview(id, { text: 'x' })).resolves.toEqual({ chunks: [] });
    await expect(
      controller.retrieve(id, { query: 'q', topK: 5, scoreThreshold: 0.3 }),
    ).resolves.toEqual({ hits: [] });
    await expect(
      controller.answer(id, { query: 'q', topK: 5, scoreThreshold: 0.3 }),
    ).resolves.toEqual({
      answer: '资料中没有相关信息',
      citations: [],
    });
  });
});
