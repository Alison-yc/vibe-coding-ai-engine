import { describe, expect, it } from 'vitest';
import {
  loadDocuments,
  loadInjectionCases,
  loadQaCases,
  loadRefusalCases,
  loadRetrievalCases,
} from './datasets.js';

describe('RAG 固定评测集', () => {
  it('包含计划要求的四类人工标注规模', async () => {
    const [documents, retrieval, qa, refusal, injection] = await Promise.all([
      loadDocuments(),
      loadRetrievalCases(),
      loadQaCases(),
      loadRefusalCases(),
      loadInjectionCases(),
    ]);
    expect(documents).toHaveLength(20);
    expect(retrieval).toHaveLength(30);
    expect(qa).toHaveLength(30);
    expect(refusal).toHaveLength(15);
    expect(injection).toHaveLength(10);
  });

  it('所有标注文档都存在于固定语料中', async () => {
    const [documents, retrieval, qa, injection] = await Promise.all([
      loadDocuments(),
      loadRetrievalCases(),
      loadQaCases(),
      loadInjectionCases(),
    ]);
    const names = new Set(documents.map((document) => document.name));
    expect(
      [...retrieval, ...qa].every((item) =>
        item.expectedDocuments.every((name) => names.has(name)),
      ),
    ).toBe(true);
    expect(injection.every((item) => names.has(item.expectedDocument))).toBe(true);
  });
});
