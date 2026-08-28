import {
  DEFAULT_UI_LOCALE,
  UI_LOCALE_STORAGE_KEY,
  UiLocaleSchema,
  type UiLocale,
} from '@ai-engine/contracts';
import type { KeyValueStore } from './types';

export const readUiLocale = async (kv: KeyValueStore): Promise<UiLocale> => {
  const stored = await kv.get(UI_LOCALE_STORAGE_KEY);
  const parsed = UiLocaleSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_UI_LOCALE;
};

export const writeUiLocale = async (
  kv: KeyValueStore,
  locale: UiLocale,
  apply: (locale: UiLocale) => void,
): Promise<void> => {
  const parsed = UiLocaleSchema.parse(locale);
  apply(parsed);
  await kv.set(UI_LOCALE_STORAGE_KEY, parsed);
};
