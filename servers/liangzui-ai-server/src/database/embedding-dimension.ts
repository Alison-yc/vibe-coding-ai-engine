import { EMBEDDING_DIMENSION } from '@ai-engine/contracts';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from './pg-vector-store';

const VECTOR_TYPE_PATTERN = /^vector\((\d+)\)$/u;

export const parseVectorColumnType = (columnType: string): number => {
  const match = VECTOR_TYPE_PATTERN.exec(columnType);
  if (!match) {
    throw new Error(`chunks.embedding 列类型无法识别：${columnType}。请先执行 pnpm db:migrate`);
  }
  return Number(match[1]);
};

export const assertEmbeddingDimensionMatchesContract = (columnType: string): void => {
  const dimension = parseVectorColumnType(columnType);
  if (dimension !== EMBEDDING_DIMENSION) {
    throw new Error(
      `向量维度不匹配：数据库 chunks.embedding 为 vector(${dimension})，契约 EMBEDDING_DIMENSION=${EMBEDDING_DIMENSION}。请生成新迁移，不要手改已提交的 SQL。`,
    );
  }
};

export const readEmbeddingColumnType = async (db: AppDatabase): Promise<string> => {
  const result = await db.execute(sql`
    SELECT format_type(a.atttypid, a.atttypmod) AS col_type
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'chunks'
      AND a.attname = 'embedding'
      AND NOT a.attisdropped
  `);
  const columnType = (result.rows[0] as { col_type?: string } | undefined)?.col_type;
  if (!columnType) {
    throw new Error('未找到 chunks.embedding 列。请先执行 pnpm db:migrate');
  }
  return columnType;
};
