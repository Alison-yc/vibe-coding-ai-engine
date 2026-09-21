import { z } from 'zod';

export const UI_LOCALES = ['zh-CN', 'ja-JP', 'en-US'] as const;
export const UiLocaleSchema = z.enum(UI_LOCALES);
export type UiLocale = z.infer<typeof UiLocaleSchema>;

export const DEFAULT_UI_LOCALE: UiLocale = 'zh-CN';
export const UI_LOCALE_STORAGE_KEY = 'ui.locale';
