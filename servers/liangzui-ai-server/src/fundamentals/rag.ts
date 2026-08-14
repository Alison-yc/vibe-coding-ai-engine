import { Document } from '@langchain/core/documents';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { createChatOllama, createOllamaEmbeddings } from './ollama';

const KNOWLEDGE_DOCUMENTS = [
  '我的名字是 liangzui。',
  '我住在北京，目前在北京生活。',
  '我今年 27 岁。',
  '我是男性。',
  '我的爱好是编程和 AI 技术。',
];

let vectorStorePromise: Promise<MemoryVectorStore> | null = null;

async function getVectorStore(): Promise<MemoryVectorStore> {
  if (!vectorStorePromise) {
    vectorStorePromise = (async () => {
      const embeddings = createOllamaEmbeddings();
      const documents = KNOWLEDGE_DOCUMENTS.map(
        (content) => new Document({ pageContent: content }),
      );
      return MemoryVectorStore.fromDocuments(documents, embeddings);
    })();
  }
  return vectorStorePromise;
}

export const ragQuery = async (question: string): Promise<string> => {
  const vectorStore = await getVectorStore();
  const relevantDocs = await vectorStore.similaritySearch(question, 3);
  const context = relevantDocs.map((doc) => doc.pageContent).join('\n');

  const llm = createChatOllama();
  const res = await llm.invoke([
    new SystemMessage(
      `你是个人知识库问答助手。请仅根据以下参考资料回答用户问题，用简洁的中文回答。如果资料中没有相关信息，请回答"我不知道"。\n\n参考资料：\n${context}`,
    ),
    new HumanMessage(question),
  ]);

  return res.text;
};
