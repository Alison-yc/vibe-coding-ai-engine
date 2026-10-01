import { DEFAULT_UI_LOCALE, UI_LOCALES, type UiLocale } from '@ai-engine/contracts';
import enAuth from './locales/en-US/auth.json';
import enChat from './locales/en-US/chat.json';
import enUS from './locales/en-US/common.json';
import enErrors from './locales/en-US/errors.json';
import enKnowledge from './locales/en-US/knowledge.json';
import enSettings from './locales/en-US/settings.json';
import enWorkflow from './locales/en-US/workflow.json';
import jaAuth from './locales/ja-JP/auth.json';
import jaChat from './locales/ja-JP/chat.json';
import jaJP from './locales/ja-JP/common.json';
import jaErrors from './locales/ja-JP/errors.json';
import jaKnowledge from './locales/ja-JP/knowledge.json';
import jaSettings from './locales/ja-JP/settings.json';
import jaWorkflow from './locales/ja-JP/workflow.json';
import zhAuth from './locales/zh-CN/auth.json';
import zhChat from './locales/zh-CN/chat.json';
import zhCN from './locales/zh-CN/common.json';
import zhErrors from './locales/zh-CN/errors.json';
import zhKnowledge from './locales/zh-CN/knowledge.json';
import zhSettings from './locales/zh-CN/settings.json';
import zhWorkflow from './locales/zh-CN/workflow.json';

export const i18nResources = {
  'zh-CN': {
    common: zhCN,
    chat: zhChat,
    knowledge: zhKnowledge,
    workflow: zhWorkflow,
    settings: zhSettings,
    errors: zhErrors,
    auth: zhAuth,
  },
  'ja-JP': {
    common: jaJP,
    chat: jaChat,
    knowledge: jaKnowledge,
    workflow: jaWorkflow,
    settings: jaSettings,
    errors: jaErrors,
    auth: jaAuth,
  },
  'en-US': {
    common: enUS,
    chat: enChat,
    knowledge: enKnowledge,
    workflow: enWorkflow,
    settings: enSettings,
    errors: enErrors,
    auth: enAuth,
  },
} as const;

export const createI18nOptions = (locale: UiLocale) => ({
  resources: i18nResources,
  lng: locale,
  fallbackLng: DEFAULT_UI_LOCALE,
  supportedLngs: [...UI_LOCALES],
  ns: ['common', 'chat', 'knowledge', 'workflow', 'settings', 'errors', 'auth'],
  defaultNS: 'common',
  load: 'currentOnly' as const,
  interpolation: { escapeValue: false },
});
