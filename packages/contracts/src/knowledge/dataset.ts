import { z } from 'zod';
import { TimestampSchema, UuidSchema } from '../common/primitives.js';

export const ChunkStrategySchema = z.enum(['fixed', 'recursive', 'markdown']);
export type ChunkStrategy = z.infer<typeof ChunkStrategySchema>;

export const ChunkConfigSchema = z
  .object({
    strategy: ChunkStrategySchema.default('recursive'),
    chunkSize: z.number().int().min(50).max(4000).default(500),
    overlap: z.number().int().min(0).max(1000).default(50),
  })
  .refine((config) => config.overlap < config.chunkSize, {
    message: 'overlap 必须小于 chunkSize',
  });
export type ChunkConfig = z.infer<typeof ChunkConfigSchema>;

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = ChunkConfigSchema.parse({
  strategy: 'recursive',
  chunkSize: 500,
  overlap: 50,
});

export const DocumentStatusSchema = z.enum([
  'pending',
  'extracting',
  'cleaning',
  'splitting',
  'embedding',
  'indexing',
  'completed',
  'failed',
]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const DocumentSourceTypeSchema = z.enum(['upload', 'paste']);
export type DocumentSourceType = z.infer<typeof DocumentSourceTypeSchema>;

export const IndexStageSchema = z.enum(['extract', 'clean', 'split', 'embed', 'index']);
export type IndexStage = z.infer<typeof IndexStageSchema>;

export const DatasetSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  embeddingModel: z.string().min(1),
  chunkConfig: ChunkConfigSchema,
  documentCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
});
export type Dataset = z.infer<typeof DatasetSchema>;

export const KnowledgeDocumentSchema = z.object({
  id: UuidSchema,
  datasetId: UuidSchema,
  name: z.string().min(1).max(255),
  sourceType: DocumentSourceTypeSchema,
  status: DocumentStatusSchema,
  error: z.string().nullable(),
  charCountBefore: z.number().int().nonnegative().nullable(),
  charCountAfter: z.number().int().nonnegative().nullable(),
  failedStage: IndexStageSchema.nullable(),
  createdAt: TimestampSchema,
});
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;

export const CreateDatasetRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  chunkConfig: ChunkConfigSchema.optional(),
});
export type CreateDatasetRequest = z.infer<typeof CreateDatasetRequestSchema>;

export const CreatePasteDocumentRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  text: z.string().min(1).max(2_000_000),
});
export type CreatePasteDocumentRequest = z.infer<typeof CreatePasteDocumentRequestSchema>;

export const SplitPreviewRequestSchema = z.object({
  text: z.string().min(1).max(200_000),
  chunkConfig: ChunkConfigSchema.optional(),
});
export type SplitPreviewRequest = z.infer<typeof SplitPreviewRequestSchema>;

export const SplitPreviewChunkSchema = z.object({
  position: z.number().int().nonnegative(),
  content: z.string(),
  headingPath: z.string().optional(),
});
export type SplitPreviewChunk = z.infer<typeof SplitPreviewChunkSchema>;

export const SplitPreviewResponseSchema = z.object({
  chunks: z.array(SplitPreviewChunkSchema),
});
export type SplitPreviewResponse = z.infer<typeof SplitPreviewResponseSchema>;

export const RetrieveRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(20).default(5),
  scoreThreshold: z.number().min(0).max(1).default(0.3),
});
export type RetrieveRequest = z.infer<typeof RetrieveRequestSchema>;

export const RetrieveHitSchema = z.object({
  chunkId: UuidSchema,
  documentId: UuidSchema,
  documentName: z.string(),
  content: z.string(),
  score: z.number(),
  position: z.number().int().nonnegative(),
  headingPath: z.string().optional(),
});
export type RetrieveHit = z.infer<typeof RetrieveHitSchema>;

export const RetrieveResponseSchema = z.object({
  hits: z.array(RetrieveHitSchema),
});
export type RetrieveResponse = z.infer<typeof RetrieveResponseSchema>;

export const KnowledgeAnswerRequestSchema = RetrieveRequestSchema;
export type KnowledgeAnswerRequest = z.infer<typeof KnowledgeAnswerRequestSchema>;

export const KNOWLEDGE_EMPTY_ANSWER = '资料中没有相关信息';

export const KnowledgeAnswerResponseSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(RetrieveHitSchema),
});
export type KnowledgeAnswerResponse = z.infer<typeof KnowledgeAnswerResponseSchema>;
