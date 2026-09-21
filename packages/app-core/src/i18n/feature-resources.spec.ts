import { ErrorCodeSchema, UI_LOCALES } from '@ai-engine/contracts';
import { describe, expect, it } from 'vitest';
import { localizeApiError } from './localize-api-error';
import { i18nResources } from './resources';

const leafKeys = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
};

describe('功能 i18n 资源', () => {
  it.each(['settings', 'errors'] as const)('%s 三种语言具有相同且非空的 key 树', (namespace) => {
    const expected = leafKeys(i18nResources['zh-CN'][namespace]).sort();
    for (const locale of UI_LOCALES) {
      expect(leafKeys(i18nResources[locale][namespace]).sort()).toEqual(expected);
      expect(JSON.stringify(i18nResources[locale][namespace])).not.toContain('""');
    }
  });

  it('errors 映射 contracts 定义的全部错误码', () => {
    const codes = ErrorCodeSchema.options;
    for (const locale of UI_LOCALES) {
      expect(Object.keys(i18nResources[locale].errors.api).sort()).toEqual([...codes].sort());
    }
  });
});

describe('localizeApiError', () => {
  const translate = (key: string) => `translated:${key}`;

  it.each(ErrorCodeSchema.options)('本地化已知错误码 %s', (code) => {
    expect(localizeApiError(Object.assign(new Error('raw'), { code }), translate)).toBe(
      `translated:api.${code}`,
    );
  });

  it('非法或缺失 code 时保留原始 Error.message', () => {
    expect(
      localizeApiError(Object.assign(new Error('original'), { code: 'UNKNOWN' }), translate),
    ).toBe('original');
    expect(localizeApiError(new Error('without code'), translate)).toBe('without code');
  });
});
