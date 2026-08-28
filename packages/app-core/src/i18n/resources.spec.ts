import { UI_LOCALES } from '@ai-engine/contracts';
import { describe, expect, it } from 'vitest';
import { i18nResources } from './resources';

const leafKeys = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
};

describe('i18n 资源', () => {
  it('三种语言具有完全相同的 key 树', () => {
    const expected = leafKeys(i18nResources['zh-CN'].common).sort();
    expect(UI_LOCALES).toEqual(Object.keys(i18nResources));
    for (const locale of UI_LOCALES) {
      expect(leafKeys(i18nResources[locale].common).sort()).toEqual(expected);
    }
  });

  it('所有叶子文案都非空', () => {
    for (const locale of UI_LOCALES) {
      const values = Object.values(i18nResources[locale].common);
      expect(values.length).toBeGreaterThan(0);
      expect(JSON.stringify(values)).not.toContain('""');
    }
  });
});
