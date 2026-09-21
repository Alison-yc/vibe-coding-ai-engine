import { useTranslation } from 'react-i18next';

export const useKnowledgeTranslation = () => {
  const { t } = useTranslation('knowledge');
  return t;
};
