import { UI_LOCALES } from '@ai-engine/contracts';
import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import { createI18nOptions, i18nResources } from './resources';

const leafKeys = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
};

describe('i18n 资源', () => {
  it('每个命名空间的三种语言具有完全相同的 key 树', () => {
    const namespaces = Object.keys(i18nResources['zh-CN']) as Array<
      keyof (typeof i18nResources)['zh-CN']
    >;
    expect(UI_LOCALES).toEqual(Object.keys(i18nResources));
    for (const namespace of namespaces) {
      const expected = leafKeys(i18nResources['zh-CN'][namespace]).sort();
      for (const locale of UI_LOCALES) {
        expect(leafKeys(i18nResources[locale][namespace]).sort()).toEqual(expected);
      }
    }
  });

  it('所有叶子文案都非空', () => {
    for (const locale of UI_LOCALES) {
      const values = Object.values(i18nResources[locale]);
      expect(values.length).toBeGreaterThan(0);
      expect(JSON.stringify(values)).not.toContain('""');
    }
  });

  it('目标语言缺 key 时回退到中文', async () => {
    const instance = createInstance();
    await instance.init({
      ...createI18nOptions('en-US'),
      resources: {
        'zh-CN': i18nResources['zh-CN'],
        'en-US': { common: { loading: 'Loading…' } },
      },
    });

    expect(instance.t('nav.settings')).toBe('设置');
  });
});
