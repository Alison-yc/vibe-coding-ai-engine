/** 与 RAG retrieve 的 applyContextBudget 同一启发式，避免裁剪时再打 Ollama。 */
export const estimateTokenCount = (text: string): number => Math.ceil([...text].length / 2);
