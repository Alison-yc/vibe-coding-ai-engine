import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

export type FeatureNamespace = 'settings' | 'errors';

export const useFeatureTranslation = (namespace: FeatureNamespace): { t: TFunction } => {
  const { t } = useTranslation(namespace);
  return { t };
};
