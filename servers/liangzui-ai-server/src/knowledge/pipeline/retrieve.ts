import type { RetrieveHit } from '@ai-engine/contracts';
import type { VectorSearchHit } from '../../database/vector-store';
import { estimateTokenCount } from '../../llm/token-estimate';

export { estimateTokenCount };

export const keywordCoverage = (query: string, content: string): number => {
  const terms = query
    .split(/\s+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
  if (terms.length === 0) return 0;
  const hits = terms.filter((term) => content.includes(term)).length;
  return hits / terms.length;
};

export const rerankHits = (query: string, hits: VectorSearchHit[]): VectorSearchHit[] =>
  [...hits]
    .map((hit) => ({
      ...hit,
      score: hit.score * 0.7 + keywordCoverage(query, hit.content) * 0.3,
    }))
    .sort((left, right) => right.score - left.score);

export const applyScoreThreshold = (
  hits: VectorSearchHit[],
  scoreThreshold: number,
): VectorSearchHit[] => hits.filter((hit) => hit.score >= scoreThreshold);

export const applyContextBudget = (
  hits: VectorSearchHit[],
  budgetTokens: number,
): VectorSearchHit[] => {
  const selected: VectorSearchHit[] = [];
  let used = 0;
  for (const hit of hits) {
    const cost = estimateTokenCount(hit.content);
    if (selected.length > 0 && used + cost > budgetTokens) break;
    selected.push(hit);
    used += cost;
  }
  return selected;
};

export const toRetrieveHits = (hits: VectorSearchHit[]): RetrieveHit[] =>
  hits.map((hit) => ({
    chunkId: hit.id,
    documentId: hit.documentId,
    documentName: hit.documentName,
    content: hit.content,
    score: hit.score,
    position: hit.position,
    headingPath: hit.headingPath,
  }));
