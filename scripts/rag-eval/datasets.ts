import { readFile } from 'node:fs/promises';
import type { EvalDocument, InjectionCase, QaCase, RefusalCase, RetrievalCase } from './types.js';

const readDataset = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(`./datasets/${name}.json`, import.meta.url), 'utf8'));

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const asRecords = (value: unknown, name: string, expectedCount: number): unknown[] => {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new Error(`${name} 必须恰好包含 ${expectedCount} 条人工标注`);
  }
  return value;
};

export const loadDocuments = async (): Promise<EvalDocument[]> =>
  asRecords(await readDataset('documents'), 'documents', 20).map((item, index) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('name' in item) ||
      typeof item.name !== 'string' ||
      !('content' in item) ||
      typeof item.content !== 'string'
    ) {
      throw new Error(`documents 第 ${index + 1} 条格式无效`);
    }
    return { name: item.name, content: item.content };
  });

export const loadRetrievalCases = async (): Promise<RetrievalCase[]> =>
  asRecords(await readDataset('retrieval'), 'retrieval', 30).map((item, index) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !('question' in item) ||
      typeof item.question !== 'string' ||
      !('expectedDocuments' in item) ||
      !isStringArray(item.expectedDocuments)
    ) {
      throw new Error(`retrieval 第 ${index + 1} 条格式无效`);
    }
    return {
      id: item.id,
      question: item.question,
      expectedDocuments: item.expectedDocuments,
    };
  });

export const loadQaCases = async (): Promise<QaCase[]> =>
  asRecords(await readDataset('qa'), 'qa', 30).map((item, index) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !('question' in item) ||
      typeof item.question !== 'string' ||
      !('expectedDocuments' in item) ||
      !isStringArray(item.expectedDocuments) ||
      !('referenceAnswer' in item) ||
      typeof item.referenceAnswer !== 'string' ||
      !('keywords' in item) ||
      !isStringArray(item.keywords)
    ) {
      throw new Error(`qa 第 ${index + 1} 条格式无效`);
    }
    return {
      id: item.id,
      question: item.question,
      expectedDocuments: item.expectedDocuments,
      referenceAnswer: item.referenceAnswer,
      keywords: item.keywords,
    };
  });

export const loadRefusalCases = async (): Promise<RefusalCase[]> =>
  asRecords(await readDataset('refusal'), 'refusal', 15).map((item, index) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !('question' in item) ||
      typeof item.question !== 'string'
    ) {
      throw new Error(`refusal 第 ${index + 1} 条格式无效`);
    }
    return { id: item.id, question: item.question };
  });

export const loadInjectionCases = async (): Promise<InjectionCase[]> =>
  asRecords(await readDataset('injection'), 'injection', 10).map((item, index) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !('question' in item) ||
      typeof item.question !== 'string' ||
      !('expectedDocument' in item) ||
      typeof item.expectedDocument !== 'string' ||
      !('forbiddenOutputs' in item) ||
      !isStringArray(item.forbiddenOutputs)
    ) {
      throw new Error(`injection 第 ${index + 1} 条格式无效`);
    }
    return {
      id: item.id,
      question: item.question,
      expectedDocument: item.expectedDocument,
      forbiddenOutputs: item.forbiddenOutputs,
    };
  });
