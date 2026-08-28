import { DEFAULT_UI_LOCALE, UI_LOCALES, type UiLocale } from '@ai-engine/contracts';
import enUS from './locales/en-US/common.json';
import jaJP from './locales/ja-JP/common.json';
import zhCN from './locales/zh-CN/common.json';

export const i18nResources = {
  'zh-CN': { common: zhCN },
  'ja-JP': { common: jaJP },
  'en-US': { common: enUS },
} as const;

export const createI18nOptions = (locale: UiLocale) => ({
  resources: i18nResources,
  lng: locale,
  fallbackLng: DEFAULT_UI_LOCALE,
  supportedLngs: [...UI_LOCALES],
  ns: ['common'],
  defaultNS: 'common',
  load: 'currentOnly' as const,
  interpolation: { escapeValue: false },
});
