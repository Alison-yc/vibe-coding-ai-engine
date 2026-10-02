import { describe, expect, it } from 'vitest';
import { NodeMetadataMap } from './metadata';
import enUS from '../../i18n/locales/en-US/workflow.json';
import jaJP from '../../i18n/locales/ja-JP/workflow.json';
import zhCN from '../../i18n/locales/zh-CN/workflow.json';

const leafKeys = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
};

describe('工作流节点元数据', () => {
  it('工作流三语词典具有完全一致的 key 树', () => {
    const expected = leafKeys(zhCN).sort();
    expect(leafKeys(jaJP).sort()).toEqual(expected);
    expect(leafKeys(enUS).sort()).toEqual(expected);
  });

  it('每类默认配置都能声明输出并通过本类校验', () => {
    for (const [type, metadata] of Object.entries(NodeMetadataMap)) {
      if (type === 'knowledge-retrieval') continue;
      expect(metadata.checkValid(metadata.defaultConfig)).toEqual([]);
      expect(metadata.getOutputVars(metadata.defaultConfig)).toBeInstanceOf(Array);
    }
    expect(
      NodeMetadataMap['knowledge-retrieval'].checkValid(
        NodeMetadataMap['knowledge-retrieval'].defaultConfig,
      ),
    ).not.toEqual([]);
    expect(NodeMetadataMap.start.getOutputVars(NodeMetadataMap.start.defaultConfig)).toEqual([
      { name: 'query', type: 'string' },
    ]);
    expect(NodeMetadataMap.end.getOutputVars(NodeMetadataMap.end.defaultConfig)).toEqual([]);
    expect(NodeMetadataMap['if-else'].getOutputVars({})).toEqual([
      { name: 'branch', type: 'string' },
    ]);
    expect(
      NodeMetadataMap['variable-assigner'].getOutputVars(
        NodeMetadataMap['variable-assigner'].defaultConfig,
      ),
    ).toEqual([{ name: 'value', type: 'unknown' }]);
    expect(NodeMetadataMap.llm.getOutputVars({})).toEqual([{ name: 'text', type: 'string' }]);
    expect(NodeMetadataMap['knowledge-retrieval'].getOutputVars({})).toEqual([
      { name: 'chunks', type: 'array' },
    ]);
    expect(NodeMetadataMap['http-request'].getOutputVars({})).toEqual([
      { name: 'status', type: 'number' },
      { name: 'headers', type: 'object' },
      { name: 'body', type: 'string' },
      { name: 'json', type: 'unknown' },
    ]);
    expect(NodeMetadataMap.code.getOutputVars({})).toEqual([{ name: 'result', type: 'unknown' }]);
  });

  it('错误配置不会伪造动态输出且会返回校验错误', () => {
    for (const type of [
      'start',
      'end',
      'variable-assigner',
      'if-else',
      'llm',
      'knowledge-retrieval',
      'http-request',
      'code',
    ] as const) {
      expect(NodeMetadataMap[type].checkValid({})).not.toEqual([]);
    }
    expect(NodeMetadataMap.start.getOutputVars({})).toEqual([]);
    expect(NodeMetadataMap.end.getOutputVars({})).toEqual([]);
    expect(NodeMetadataMap['variable-assigner'].getOutputVars({})).toEqual([]);
  });
});
