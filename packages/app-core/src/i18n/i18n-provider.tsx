import { DEFAULT_UI_LOCALE, UI_LOCALES } from '@ai-engine/contracts';
import { usePlatform } from '@ai-engine/platform';
import { createInstance, type i18n } from 'i18next';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { i18nResources } from './resources';

const initializeI18n = async (instance: i18n, platform: ReturnType<typeof usePlatform>) => {
  const locale = await platform.getUiLocale().catch(() => DEFAULT_UI_LOCALE);
  await instance.use(initReactI18next).init({
    resources: i18nResources,
    lng: locale,
    fallbackLng: DEFAULT_UI_LOCALE,
    supportedLngs: [...UI_LOCALES],
    ns: ['common'],
    defaultNS: 'common',
    load: 'currentOnly',
    interpolation: { escapeValue: false },
  });
  await platform.setUiLocale(locale).catch(() => undefined);
};

export const AppI18nProvider = ({ children }: { children: ReactNode }) => {
  const platform = usePlatform();
  const [instance] = useState(() => createInstance());
  const [ready, setReady] = useState(false);
  const initialization = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;
    initialization.current ??= initializeI18n(instance, platform);
    void initialization.current.then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [instance, platform]);

  if (!ready) return null;
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
};
