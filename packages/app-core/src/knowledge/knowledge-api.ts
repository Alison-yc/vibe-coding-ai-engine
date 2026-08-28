import {
  CreateDatasetRequestSchema,
  CreatePasteDocumentRequestSchema,
  DatasetSchema,
  KnowledgeAnswerResponseSchema,
  KnowledgeDocumentSchema,
  RetrieveResponseSchema,
  SplitPreviewResponseSchema,
  type CreateDatasetRequest,
  type CreatePasteDocumentRequest,
  type Dataset,
  type KnowledgeAnswerRequest,
  type KnowledgeAnswerResponse,
  type KnowledgeDocument,
  type RetrieveRequest,
  type RetrieveResponse,
  type SplitPreviewRequest,
  type SplitPreviewResponse,
} from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';
import { createApiRequestError } from '../api/api-error';

const requestJson = async (
  platform: Platform,
  path: string,
  init?: RequestInit,
): Promise<unknown> => {
  const baseUrl = platform.getApiBaseUrl().replace(/\/$/, '');
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createApiRequestError(data, response.status);
  }
  return data;
};

export const listDatasets = async (platform: Platform): Promise<Dataset[]> => {
  const data = await requestJson(platform, '/knowledge/datasets');
  return DatasetSchema.array().parse(data);
};

export const createDataset = async (
  platform: Platform,
  body: CreateDatasetRequest,
): Promise<Dataset> => {
  const data = await requestJson(platform, '/knowledge/datasets', {
    method: 'POST',
    body: JSON.stringify(CreateDatasetRequestSchema.parse(body)),
  });
  return DatasetSchema.parse(data);
};

export const getDataset = async (platform: Platform, datasetId: string): Promise<Dataset> => {
  const data = await requestJson(platform, `/knowledge/datasets/${datasetId}`);
  return DatasetSchema.parse(data);
};

export const listDocuments = async (
  platform: Platform,
  datasetId: string,
): Promise<KnowledgeDocument[]> => {
  const data = await requestJson(platform, `/knowledge/datasets/${datasetId}/documents`);
  return KnowledgeDocumentSchema.array().parse(data);
};

export const createPasteDocument = async (
  platform: Platform,
  datasetId: string,
  body: CreatePasteDocumentRequest,
): Promise<KnowledgeDocument> => {
  const data = await requestJson(platform, `/knowledge/datasets/${datasetId}/documents`, {
    method: 'POST',
    body: JSON.stringify(CreatePasteDocumentRequestSchema.parse(body)),
  });
  return KnowledgeDocumentSchema.parse(data);
};

export const uploadDocument = async (
  platform: Platform,
  datasetId: string,
  file: File,
): Promise<KnowledgeDocument> => {
  const form = new FormData();
  form.set('file', file);
  const data = await requestJson(platform, `/knowledge/datasets/${datasetId}/documents/upload`, {
    method: 'POST',
    body: form,
  });
  return KnowledgeDocumentSchema.parse(data);
};

export const getDocument = async (
  platform: Platform,
  documentId: string,
): Promise<KnowledgeDocument> => {
  const data = await requestJson(platform, `/knowledge/documents/${documentId}`);
  return KnowledgeDocumentSchema.parse(data);
};

export const deleteDocument = async (platform: Platform, documentId: string): Promise<void> => {
  await requestJson(platform, `/knowledge/documents/${documentId}`, { method: 'DELETE' });
};

export const previewSplit = async (
  platform: Platform,
  datasetId: string,
  body: SplitPreviewRequest,
): Promise<SplitPreviewResponse> => {
  const data = await requestJson(platform, `/knowledge/datasets/${datasetId}/split-preview`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return SplitPreviewResponseSchema.parse(data);
};

export const retrieveDataset = async (
  platform: Platform,
  datasetId: string,
  body: RetrieveRequest,
): Promise<RetrieveResponse> => {
  const data = await requestJson(platform, `/knowledge/datasets/${datasetId}/retrieve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return RetrieveResponseSchema.parse(data);
};

export const answerDataset = async (
  platform: Platform,
  datasetId: string,
  body: KnowledgeAnswerRequest,
): Promise<KnowledgeAnswerResponse> => {
  const data = await requestJson(platform, `/knowledge/datasets/${datasetId}/answer`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return KnowledgeAnswerResponseSchema.parse(data);
};

export const waitForDocument = async (
  platform: Platform,
  documentId: string,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<KnowledgeDocument> => {
  const attempts = options.attempts ?? 40;
  const delayMs = options.delayMs ?? 200;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const document = await getDocument(platform, documentId);
    if (document.status === 'completed' || document.status === 'failed') return document;
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
  return getDocument(platform, documentId);
};
