import {
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { SCHEMA_EMBEDDING_DIMENSION } from './embedding-size';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const datasets = pgTable('datasets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  embeddingModel: text('embedding_model').notNull(),
  chunkConfig: jsonb('chunk_config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id')
    .notNull()
    .references(() => datasets.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sourceType: text('source_type').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  extractedText: text('extracted_text'),
  cleanedText: text('cleaned_text'),
  charCountBefore: integer('char_count_before'),
  charCountAfter: integer('char_count_after'),
  failedStage: text('failed_stage'),
  sourceBytes: bytea('source_bytes'),
  splitChunks: jsonb('split_chunks'),
  embeddedChunks: jsonb('embedded_chunks'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chunks = pgTable('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: SCHEMA_EMBEDDING_DIMENSION }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  position: integer('position').notNull(),
});
