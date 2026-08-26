import { EMBEDDING_DIMENSION } from '@ai-engine/contracts';
import { describe, expect, it } from 'vitest';
import {
  assertEmbeddingDimensionMatchesContract,
  parseVectorColumnType,
} from './embedding-dimension';
import { SCHEMA_EMBEDDING_DIMENSION } from './schema/embedding-size';

describe('向量维度自检', () => {
  it('schema 常量与契约层一致', () => {
    expect(SCHEMA_EMBEDDING_DIMENSION).toBe(EMBEDDING_DIMENSION);
  });

  it('从 format_type 解析 vector(n)', () => {
    expect(parseVectorColumnType('vector(768)')).toBe(768);
  });

  it('与契约维度一致时通过', () => {
    expect(() =>
      assertEmbeddingDimensionMatchesContract(`vector(${EMBEDDING_DIMENSION})`),
    ).not.toThrow();
  });

  it('故意改成 512 时拒绝启动', () => {
    expect(() => assertEmbeddingDimensionMatchesContract('vector(512)')).toThrow('向量维度不匹配');
  });

  it('无法识别的列类型提示先迁移', () => {
    expect(() => parseVectorColumnType('text')).toThrow('pnpm db:migrate');
  });
});
