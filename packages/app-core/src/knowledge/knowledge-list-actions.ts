import type { Dataset } from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';
import { createDataset, listDatasets } from './knowledge-api';

export const loadKnowledgeListError = (error: unknown, fallback = '加载失败'): string =>
  error instanceof Error ? error.message : fallback;

export const createKnowledgeListError = (error: unknown, fallback = '创建失败'): string =>
  error instanceof Error ? error.message : fallback;

export const refreshKnowledgeList = async (platform: Platform): Promise<Dataset[]> =>
  listDatasets(platform);

export const createKnowledgeDataset = async (platform: Platform, name: string): Promise<void> => {
  await createDataset(platform, { name });
};

type ListStateSetters = {
  name: string;
  setName: (value: string) => void;
  setDatasets: (datasets: Dataset[]) => void;
  setError: (message: string | null) => void;
  setLoading: (value: boolean) => void;
  loadErrorFallback?: string;
  createErrorFallback?: string;
  formatError?: (error: unknown, fallback: string) => string;
};

export const createKnowledgeListHandlers = (platform: Platform, setters: ListStateSetters) => {
  const refresh = async () => {
    setters.setLoading(true);
    setters.setError(null);
    try {
      setters.setDatasets(await refreshKnowledgeList(platform));
    } catch (loadError) {
      const fallback = setters.loadErrorFallback ?? '加载失败';
      setters.setError(
        setters.formatError?.(loadError, fallback) ?? loadKnowledgeListError(loadError, fallback),
      );
    } finally {
      setters.setLoading(false);
    }
  };
  const create = async () => {
    setters.setError(null);
    try {
      await createKnowledgeDataset(platform, setters.name);
      setters.setLoading(true);
      setters.setDatasets(await refreshKnowledgeList(platform));
    } catch (loadError) {
      const fallback = setters.createErrorFallback ?? '创建失败';
      setters.setError(
        setters.formatError?.(loadError, fallback) ?? createKnowledgeListError(loadError, fallback),
      );
    } finally {
      setters.setLoading(false);
    }
  };
  return {
    onNameChange: (event: { target: { value: string } }) => {
      setters.setName(event.target.value);
    },
    refresh,
    create,
    onRefreshClick: () => {
      void refresh();
    },
    onCreateClick: () => {
      void create();
    },
  };
};
