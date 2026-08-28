import type { ChunkConfig, KnowledgeDocument, RetrieveHit } from '@ai-engine/contracts';
import type { Platform } from '@ai-engine/platform';
import {
  answerDataset,
  createPasteDocument,
  deleteDocument,
  getDataset,
  listDocuments,
  previewSplit,
  retrieveDataset,
  uploadDocument,
  waitForDocument,
} from './knowledge-api';

export const knowledgeActionError = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export const loadKnowledgeDetail = async (platform: Platform, datasetId: string) => {
  const dataset = await getDataset(platform, datasetId);
  const documents = await listDocuments(platform, datasetId);
  return { dataset, documents };
};

export const indexPastedDocument = async (
  platform: Platform,
  datasetId: string,
  name: string,
  text: string,
): Promise<KnowledgeDocument> => {
  const document = await createPasteDocument(platform, datasetId, { name, text });
  return waitForDocument(platform, document.id);
};

export const indexUploadedDocument = async (
  platform: Platform,
  datasetId: string,
  file: File,
): Promise<KnowledgeDocument> => {
  const document = await uploadDocument(platform, datasetId, file);
  return waitForDocument(platform, document.id);
};

export const previewKnowledgeSplit = async (
  platform: Platform,
  datasetId: string,
  text: string,
  chunkConfig: ChunkConfig,
) => previewSplit(platform, datasetId, { text, chunkConfig });

export const runKnowledgeRetrieve = async (
  platform: Platform,
  datasetId: string,
  query: string,
): Promise<{ hits: RetrieveHit[]; answer: string | null }> => {
  const result = await retrieveDataset(platform, datasetId, {
    query,
    topK: 5,
    scoreThreshold: 0.3,
  });
  return { hits: result.hits, answer: null };
};

export const runKnowledgeAnswer = async (
  platform: Platform,
  datasetId: string,
  query: string,
): Promise<{ hits: RetrieveHit[]; answer: string }> => {
  const result = await answerDataset(platform, datasetId, {
    query,
    topK: 5,
    scoreThreshold: 0.3,
  });
  return { hits: result.citations, answer: result.answer };
};

export const removeKnowledgeDocument = async (
  platform: Platform,
  documentId: string,
): Promise<void> => {
  await deleteDocument(platform, documentId);
};

type DetailSetters = {
  pasteName: string;
  pasteText: string;
  previewText: string;
  query: string;
  chunkConfig: ChunkConfig;
  setDataset: (dataset: Awaited<ReturnType<typeof loadKnowledgeDetail>>['dataset']) => void;
  setDocuments: (documents: KnowledgeDocument[]) => void;
  setPasteName: (value: string) => void;
  setPasteText: (value: string) => void;
  setPreviewText: (value: string) => void;
  setChunkSize: (value: number) => void;
  setOverlap: (value: number) => void;
  setStrategy: (value: ChunkConfig['strategy']) => void;
  setPreviewChunks: (chunks: Awaited<ReturnType<typeof previewKnowledgeSplit>>['chunks']) => void;
  setQuery: (value: string) => void;
  setHits: (hits: RetrieveHit[]) => void;
  setAnswer: (answer: string | null) => void;
  setError: (message: string | null) => void;
  indexErrorFallback?: string;
  uploadErrorFallback?: string;
};

export const createKnowledgeDetailHandlers = (
  platform: Platform,
  datasetId: string,
  setters: DetailSetters,
) => {
  const refresh = async () => {
    setters.setError(null);
    const detail = await loadKnowledgeDetail(platform, datasetId);
    setters.setDataset(detail.dataset);
    setters.setDocuments(detail.documents);
  };
  const paste = async () => {
    try {
      const indexed = await indexPastedDocument(
        platform,
        datasetId,
        setters.pasteName,
        setters.pasteText,
      );
      if (indexed.status === 'failed') {
        setters.setError(indexed.error ?? setters.indexErrorFallback ?? '索引失败');
      }
      const detail = await loadKnowledgeDetail(platform, datasetId);
      setters.setDataset(detail.dataset);
      setters.setDocuments(detail.documents);
    } catch (loadError) {
      setters.setError(knowledgeActionError(loadError, setters.indexErrorFallback ?? '索引失败'));
    }
  };
  const upload = async (event: { target: { files?: FileList | null } }) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const indexed = await indexUploadedDocument(platform, datasetId, file);
      if (indexed.status === 'failed') {
        setters.setError(indexed.error ?? setters.indexErrorFallback ?? '索引失败');
      }
      const detail = await loadKnowledgeDetail(platform, datasetId);
      setters.setDataset(detail.dataset);
      setters.setDocuments(detail.documents);
    } catch (loadError) {
      setters.setError(knowledgeActionError(loadError, setters.uploadErrorFallback ?? '上传失败'));
    }
  };
  const remove = async (documentId: string) => {
    await removeKnowledgeDocument(platform, documentId);
    const detail = await loadKnowledgeDetail(platform, datasetId);
    setters.setDataset(detail.dataset);
    setters.setDocuments(detail.documents);
  };
  const removeFromEvent = async (event: {
    currentTarget: { getAttribute: (name: string) => string | null };
  }) => {
    const documentId = event.currentTarget.getAttribute('data-document-id');
    if (!documentId) return;
    await remove(documentId);
  };
  const preview = async () => {
    const result = await previewKnowledgeSplit(
      platform,
      datasetId,
      setters.previewText,
      setters.chunkConfig,
    );
    setters.setPreviewChunks(result.chunks);
  };
  const retrieve = async () => {
    const result = await runKnowledgeRetrieve(platform, datasetId, setters.query);
    setters.setHits(result.hits);
    setters.setAnswer(result.answer);
  };
  const answer = async () => {
    const result = await runKnowledgeAnswer(platform, datasetId, setters.query);
    setters.setHits(result.hits);
    setters.setAnswer(result.answer);
  };
  return {
    onPasteNameChange: (event: { target: { value: string } }) => {
      setters.setPasteName(event.target.value);
    },
    onPasteTextChange: (event: { target: { value: string } }) => {
      setters.setPasteText(event.target.value);
    },
    onPreviewTextChange: (event: { target: { value: string } }) => {
      setters.setPreviewText(event.target.value);
    },
    onStrategyChange: (event: { target: { value: string } }) => {
      setters.setStrategy(event.target.value as ChunkConfig['strategy']);
    },
    onChunkSizeChange: (event: { target: { value: string } }) => {
      setters.setChunkSize(Number(event.target.value));
    },
    onOverlapChange: (event: { target: { value: string } }) => {
      setters.setOverlap(Number(event.target.value));
    },
    onQueryChange: (event: { target: { value: string } }) => {
      setters.setQuery(event.target.value);
    },
    refresh,
    paste,
    upload,
    remove,
    removeFromEvent,
    preview,
    retrieve,
    answer,
    onRefreshClick: () => {
      void refresh();
    },
    onPasteClick: () => {
      void paste();
    },
    onUploadChange: (event: { target: { files?: FileList | null } }) => {
      void upload(event);
    },
    onRemoveClick: (event: {
      currentTarget: { getAttribute: (name: string) => string | null };
    }) => {
      void removeFromEvent(event);
    },
    onPreviewClick: () => {
      void preview();
    },
    onRetrieveClick: () => {
      void retrieve();
    },
    onAnswerClick: () => {
      void answer();
    },
  };
};
