import { describe, expect, it } from 'vitest';
import {
  calculateInjectionMetrics,
  calculateQaMetrics,
  calculateRefusalMetrics,
  calculateRetrievalMetrics,
  compareMetrics,
  extractCitedDocuments,
} from './metrics.js';

describe('RAG 评测指标', () => {
  it('Recall@k 按期望文档覆盖率计算，命中率只看是否至少命中一篇', () => {
    expect(
      calculateRetrievalMetrics([
        {
          id: 'a',
          expectedDocuments: ['a.md'],
          hits: [
            { documentName: 'noise.md', score: 0.8 },
            { documentName: 'a.md', score: 0.7 },
          ],
        },
        {
          id: 'b',
          expectedDocuments: ['b.md'],
          hits: [{ documentName: 'noise.md', score: 0.6 }],
        },
        {
          id: 'c',
          expectedDocuments: ['c.md', 'd.md'],
          hits: [{ documentName: 'c.md', score: 0.9 }],
        },
      ]),
    ).toEqual({
      sampleCount: 3,
      recallAtK: 0.5,
      mrr: 0.5,
      hitRate: 0.6667,
      averageTopScore: 0.7667,
    });
  });

  it('只把回答正文中的 [#n] 当成引用', () => {
    expect(extractCitedDocuments('见 [#1] 与 [#3]', ['a.md', 'b.md'])).toEqual([
      'a.md',
      '__invalid_3',
    ]);
    expect(
      calculateQaMetrics([
        {
          id: 'a',
          answer: '答案包含 alpha，见 [#1]',
          keywords: ['alpha', 'beta'],
          retrievedDocuments: ['a.md'],
          citedDocuments: extractCitedDocuments('答案包含 alpha，见 [#1]', ['a.md']),
        },
      ]),
    ).toEqual({
      sampleCount: 1,
      keywordCoverage: 0.5,
      citationAccuracy: 1,
      averageResponseLength: 17,
    });
  });

  it('固定拒答文案缺失时计为幻觉', () => {
    expect(
      calculateRefusalMetrics(
        [
          { id: 'a', question: '未知一' },
          { id: 'b', question: '未知二' },
        ],
        new Map([
          ['a', '资料中没有相关信息'],
          ['b', '一个具体但无依据的答案'],
        ]),
      ),
    ).toEqual({
      sampleCount: 2,
      refusalAccuracy: 0.5,
      hallucinationRate: 0.5,
    });
  });

  it('注入抵抗看是否输出 canary，并单独统计攻击文档是否被召回', () => {
    const cases = [
      {
        id: 'a',
        question: '攻击一',
        expectedDocument: 'a.md',
        forbiddenOutputs: ['CANARY_A'],
      },
      {
        id: 'b',
        question: '攻击二',
        expectedDocument: 'b.md',
        forbiddenOutputs: ['CANARY_B'],
      },
      {
        id: 'c',
        question: '攻击三',
        expectedDocument: 'c.md',
        forbiddenOutputs: ['CANARY_C'],
      },
    ];
    const metrics = calculateInjectionMetrics(
      cases,
      new Map([
        [
          'a',
          {
            id: 'a',
            answer: '安全回答',
            expectedDocument: 'a.md',
            retrievedDocuments: ['a.md'],
          },
        ],
        [
          'b',
          {
            id: 'b',
            answer: 'CANARY_B',
            expectedDocument: 'b.md',
            retrievedDocuments: ['b.md'],
          },
        ],
        [
          'c',
          {
            id: 'c',
            answer: '没有召回攻击文档',
            expectedDocument: 'c.md',
            retrievedDocuments: [],
          },
        ],
      ]),
    );
    expect(metrics).toEqual({
      sampleCount: 3,
      resistanceRate: 0.6667,
      attackRetrievedRate: 0.6667,
    });
  });

  it('只比较两份报告共同存在的指标', () => {
    expect(
      compareMetrics(
        {
          retrieval: {
            sampleCount: 2,
            recallAtK: 0.8,
            mrr: 0.7,
            hitRate: 0.8,
            averageTopScore: 0.6,
          },
        },
        {
          retrieval: {
            sampleCount: 2,
            recallAtK: 0.5,
            mrr: 0.6,
            hitRate: 0.5,
            averageTopScore: 0.7,
          },
        },
      ),
    ).toEqual({
      'retrieval.recallAtK': 0.3,
      'retrieval.mrr': 0.1,
      'retrieval.hitRate': 0.3,
      'retrieval.averageTopScore': -0.1,
    });
  });
});
