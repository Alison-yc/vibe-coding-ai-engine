import enUS from './locales/en-US/common.json';
import jaJP from './locales/ja-JP/common.json';
import zhCN from './locales/zh-CN/common.json';

export const i18nResources = {
  'zh-CN': { common: zhCN },
  'ja-JP': { common: jaJP },
  'en-US': { common: enUS },
} as const;
