import type { BaselineOllamaClient } from '../ollama-client.js';
import type { BaselineOptions, BaselineRow, BaselineSection } from '../types.js';

const entities = [
  ['海棠项目', '北京', 'TypeScript', '蓝色', '周一', '向量检索'],
  ['松柏项目', '上海', 'Rust', '绿色', '周二', '桌面应用'],
  ['晨曦项目', '深圳', 'Python', '橙色', '周三', '数据清洗'],
  ['星河项目', '杭州', 'Go', '紫色', '周四', '服务网关'],
  ['远山项目', '成都', 'Java', '红色', '周五', '工作流'],
  ['清泉项目', '南京', 'Kotlin', '青色', '周六', '移动端'],
  ['云帆项目', '武汉', 'C#', '黄色', '周日', '监控告警'],
  ['竹影项目', '西安', 'Swift', '银色', '每月一日', '图像处理'],
  ['秋实项目', '苏州', 'Ruby', '金色', '每月十五日', '权限系统'],
  ['微光项目', '厦门', 'C++', '白色', '每季度首日', '模型评测'],
] as const;

const labels = ['所在地', '主要语言', '主题色', '例会时间', '核心方向'] as const;
const questionTemplates = [
  (name: string) => `${name}位于哪个城市？`,
  (name: string) => `${name}主要使用什么编程语言？`,
  (name: string) => `${name}的主题色是什么？`,
  (name: string) => `${name}什么时候开例会？`,
  (name: string) => `${name}的核心方向是什么？`,
] as const;

type Chunk = { id: string; entityIndex: number; text: string };
type Query = { id: string; entityIndex: number; text: string };

const makeDocuments = (): string[] =>
  entities.map(([name, ...values]) =>
    values.map((value, index) => `${name}的${labels[index] ?? '属性'}是${value}。`).join('\n\n'),
  );

const chunkDocuments = (strategy: 'fixed-512' | 'paragraph' | 'semantic-boundary'): Chunk[] => {
  const documents = makeDocuments();
  if (strategy === 'fixed-512') {
    return documents.map((text, entityIndex) => ({
      id: `${strategy}-${entityIndex}`,
      entityIndex,
      text: text.slice(0, 512),
    }));
  }

  return documents.flatMap((document, entityIndex) => {
    const paragraphs = document.split('\n\n');
    if (strategy === 'paragraph') {
      return paragraphs.map((text, index) => ({
        id: `${strategy}-${entityIndex}-${index}`,
        entityIndex,
        text,
      }));
    }
    return Array.from({ length: Math.ceil(paragraphs.length / 2) }, (_, index) => ({
      id: `${strategy}-${entityIndex}-${index}`,
      entityIndex,
      text: paragraphs.slice(index * 2, index * 2 + 2).join('\n'),
    }));
  });
};

const queries: Query[] = entities.flatMap(([name], entityIndex) =>
  questionTemplates.map((template, index) => ({
    id: `${entityIndex}-${index}`,
    entityIndex,
    text: template(name),
  })),
);

const cosineSimilarity = (left: number[], right: number[]): number => {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

export const runEmbeddingCase = async (
  client: BaselineOllamaClient,
  options: BaselineOptions,
): Promise<BaselineSection> => {
  const rows: BaselineRow[] = [];
  const queryVectors = await client.embed(
    options.embedModel,
    queries.map((query) => query.text),
  );

  for (const strategy of ['fixed-512', 'paragraph', 'semantic-boundary'] as const) {
    const chunks = chunkDocuments(strategy);
    const chunkVectors = await client.embed(
      options.embedModel,
      chunks.map((chunk) => chunk.text),
    );
    let recallAt1 = 0;
    let recallAt3 = 0;
    let reciprocalRank = 0;

    queries.forEach((query, queryIndex) => {
      const queryVector = queryVectors[queryIndex];
      if (!queryVector) throw new Error(`缺少查询向量 ${query.id}`);
      const ranked = chunks
        .map((chunk, chunkIndex) => ({
          chunk,
          score: cosineSimilarity(queryVector, chunkVectors[chunkIndex] ?? []),
        }))
        .sort((left, right) => right.score - left.score);
      const rank = ranked.findIndex((item) => item.chunk.entityIndex === query.entityIndex) + 1;
      if (rank === 1) recallAt1 += 1;
      if (rank > 0 && rank <= 3) recallAt3 += 1;
      if (rank > 0) reciprocalRank += 1 / rank;
    });

    rows.push({
      id: strategy,
      metrics: {
        chunks: chunks.length,
        queries: queries.length,
        recallAt1: Number((recallAt1 / queries.length).toFixed(3)),
        recallAt3: Number((recallAt3 / queries.length).toFixed(3)),
        mrr: Number((reciprocalRank / queries.length).toFixed(3)),
        dimension: chunkVectors[0]?.length ?? 0,
      },
    });
  }

  return {
    caseName: 'embedding',
    title: '中文 Embedding 检索质量',
    columns: ['chunks', 'queries', 'recallAt1', 'recallAt3', 'mrr', 'dimension'],
    rows,
    conclusions: [
      '50 条查询包含名称相近、属性不同的干扰项；Recall@3 与 MRR 决定 RAG 默认切分策略。',
    ],
  };
};
