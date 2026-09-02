import { describe, expect, it } from 'vitest';
import type { AppDatabase } from '../database/pg-vector-store';
import {
  createKnowledgeRepository,
  DrizzleKnowledgeRepository,
  InMemoryKnowledgeRepository,
} from './knowledge.repository';

const datasetRow = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '库',
  embeddingModel: 'nomic-embed-text:latest',
  chunkConfig: {},
  createdAt: new Date('2026-08-27T00:00:00.000Z'),
};

const documentRow = {
  id: '00000000-0000-4000-8000-000000000002',
  datasetId: datasetRow.id,
  name: 'a.md',
  sourceType: 'paste',
  status: 'pending',
  error: null,
  extractedText: '北京',
  cleanedText: null,
  charCountBefore: null,
  charCountAfter: null,
  failedStage: null,
  sourceBytes: null,
  splitChunks: null,
  embeddedChunks: null,
  createdAt: new Date('2026-08-27T00:00:00.000Z'),
};

const createChain = (result: unknown): object => {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (prop === 'then') {
        const promise = Promise.resolve(result);
        return promise.then.bind(promise);
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
};

const mockDb = (selectQueue: unknown[][]): AppDatabase => {
  const queue = [...selectQueue];
  return {
    insert: () => createChain([datasetRow]),
    select: () => createChain(queue.shift() ?? []),
    update: () => createChain(undefined),
    delete: () => createChain(undefined),
  } as never;
};

describe('createKnowledgeRepository', () => {
  it('有数据库时用 Drizzle 实现', () => {
    expect(createKnowledgeRepository({} as AppDatabase, 'test')).toBeInstanceOf(
      DrizzleKnowledgeRepository,
    );
  });

  it('非生产且无库时用内存实现', () => {
    expect(createKnowledgeRepository(null, 'test')).toBeInstanceOf(InMemoryKnowledgeRepository);
  });

  it('生产环境无库时拒绝启动', () => {
    expect(() => createKnowledgeRepository(null, 'production')).toThrow('PostgreSQL');
  });
});

describe('InMemoryKnowledgeRepository', () => {
  it('创建后可列出、更新并删除文档', async () => {
    const repository = new InMemoryKnowledgeRepository();
    const dataset = await repository.createDataset('个人', 'nomic-embed-text:latest', {
      strategy: 'recursive',
      chunkSize: 500,
      overlap: 50,
    });
    const document = await repository.createDocument({
      datasetId: dataset.id,
      name: 'a.md',
      sourceType: 'paste',
      extractedText: '北京',
      sourceBytes: new Uint8Array([1, 2, 3]),
    });
    expect(await repository.listPendingDocumentIds()).toEqual([document.id]);
    await repository.updateDocument(document.id, { status: 'embedding' });
    expect(await repository.listPendingDocumentIds()).toEqual([document.id]);
    expect((await repository.getDocument(document.id))?.sourceBytes).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await repository.updateDocument(document.id, { status: 'completed' });
    expect(await repository.listPendingDocumentIds()).toEqual([]);
    expect((await repository.listDatasets())[0]?.documentCount).toBe(1);
    await repository.deleteDataset(dataset.id);
    expect(await repository.getDataset(dataset.id)).toBeNull();
    expect(await repository.countChunks(document.id)).toBe(0);
  });
});

describe('DrizzleKnowledgeRepository', () => {
  it('createDataset 解析返回行', async () => {
    const repository = new DrizzleKnowledgeRepository(mockDb([[{ value: 0 }], [{ value: 0 }]]));
    const created = await repository.createDataset('库', 'nomic-embed-text:latest', {
      strategy: 'recursive',
      chunkSize: 500,
      overlap: 50,
    });
    expect(created.name).toBe('库');
    expect(created.documentCount).toBe(0);
  });

  it('insert 未返回行时失败', async () => {
    const db = {
      insert: () => createChain([]),
      select: () => createChain([]),
      update: () => createChain(undefined),
      delete: () => createChain(undefined),
    } as never;
    const repository = new DrizzleKnowledgeRepository(db);
    await expect(
      repository.createDataset('库', 'nomic-embed-text:latest', {
        strategy: 'recursive',
        chunkSize: 500,
        overlap: 50,
      }),
    ).rejects.toThrow('无法创建知识库');
    await expect(
      repository.createDocument({
        datasetId: datasetRow.id,
        name: 'a.md',
        sourceType: 'paste',
      }),
    ).rejects.toThrow('无法创建文档');
  });

  it('getDataset 无行时返回 null', async () => {
    const repository = new DrizzleKnowledgeRepository(mockDb([[]]));
    await expect(repository.getDataset(datasetRow.id)).resolves.toBeNull();
    await expect(repository.getDocument(documentRow.id)).resolves.toBeNull();
  });

  it('list/get/delete 走查询链', async () => {
    const repository = new DrizzleKnowledgeRepository(
      mockDb([
        [datasetRow],
        [{ value: 1 }],
        [{ value: 2 }],
        [datasetRow],
        [{ value: 1 }],
        [{ value: 2 }],
        [documentRow],
        [documentRow],
        [{ id: documentRow.id }],
        [{ value: 3 }],
      ]),
    );
    const listed = await repository.listDatasets();
    expect(listed[0]?.chunkCount).toBe(2);
    await expect(repository.getDataset(datasetRow.id)).resolves.toMatchObject({ name: '库' });
    await expect(repository.listDocuments(datasetRow.id)).resolves.toHaveLength(1);
    await expect(repository.getDocument(documentRow.id)).resolves.toMatchObject({ name: 'a.md' });
    await expect(repository.listPendingDocumentIds()).resolves.toEqual([documentRow.id]);
    await expect(repository.countChunks(documentRow.id)).resolves.toBe(3);
    await repository.deleteDataset(datasetRow.id);
    await repository.deleteDocument(documentRow.id);
    await repository.updateDocument(documentRow.id, { status: 'completed', cleanedText: '北京' });
    await repository.updateDocument(documentRow.id, {});
  });

  it('createDocument 映射 DTO', async () => {
    const db = {
      insert: () => createChain([documentRow]),
      select: () => createChain([]),
      update: () => createChain(undefined),
      delete: () => createChain(undefined),
    } as never;
    const repository = new DrizzleKnowledgeRepository(db);
    await expect(
      repository.createDocument({
        datasetId: datasetRow.id,
        name: 'a.md',
        sourceType: 'paste',
        extractedText: '北京',
      }),
    ).resolves.toMatchObject({ name: 'a.md', status: 'pending' });
  });
});
