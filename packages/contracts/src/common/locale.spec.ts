import { describe, expect, it } from 'vitest';
import { DEFAULT_UI_LOCALE, UI_LOCALES, UI_LOCALE_STORAGE_KEY, UiLocaleSchema } from './locale.js';

describe('界面语言契约', () => {
  it('只接受中日英 BCP 47 标签', () => {
    expect(UI_LOCALES).toEqual(['zh-CN', 'ja-JP', 'en-US']);
    expect(UI_LOCALES.every((locale) => UiLocaleSchema.safeParse(locale).success)).toBe(true);
    expect(UiLocaleSchema.safeParse('zh').success).toBe(false);
    expect(DEFAULT_UI_LOCALE).toBe('zh-CN');
    expect(UI_LOCALE_STORAGE_KEY).toBe('ui.locale');
  });
});
