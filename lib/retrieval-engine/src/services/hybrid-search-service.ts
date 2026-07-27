import type { KeywordSearchHit } from "../ports/keyword-search-port.js";
import type { RuntimeKnowledgeChunkSnapshot } from "../providers/knowledge-provider.js";

export type HybridSearchInput = {
  vectorChunks: RuntimeKnowledgeChunkSnapshot[];
  keywordHits: KeywordSearchHit[];
  vectorWeight?: number;
  keywordWeight?: number;
};

const DEFAULT_VECTOR_WEIGHT = 0.7;
const DEFAULT_KEYWORD_WEIGHT = 0.3;
const RRF_K = 60;

/**
 * Reciprocal Rank Fusion — merges vector and keyword retrieval lists.
 */
export function fuseHybridResults(input: HybridSearchInput): RuntimeKnowledgeChunkSnapshot[] {
  const vectorWeight = input.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
  const keywordWeight = input.keywordWeight ?? DEFAULT_KEYWORD_WEIGHT;
  const scores = new Map<string, { chunk: RuntimeKnowledgeChunkSnapshot; score: number }>();

  input.vectorChunks.forEach((chunk, index) => {
    const rrf = vectorWeight / (RRF_K + index + 1);
    const existing = scores.get(chunk.id);
    scores.set(chunk.id, {
      chunk: { ...chunk, metadata: { ...chunk.metadata, retrieval_channel: "vector" } },
      score: (existing?.score ?? 0) + rrf + (chunk.score ?? 0) * 0.1,
    });
  });

  input.keywordHits.forEach((hit, index) => {
    const rrf = keywordWeight / (RRF_K + index + 1);
    const snapshot: RuntimeKnowledgeChunkSnapshot = {
      id: hit.chunkId,
      content: hit.content,
      score: hit.score,
      rank: hit.rank,
      tokenCount: Math.ceil(hit.content.length / 4),
      documentTitle: hit.documentTitle,
      metadata: {
        documentId: hit.documentId,
        sourceId: hit.sourceId,
        sectionTitle: hit.sectionTitle,
        pageNumber: hit.pageNumber,
        retrieval_channel: "keyword",
        keywordScore: hit.score,
      },
    };
    const existing = scores.get(hit.chunkId);
    scores.set(hit.chunkId, {
      chunk: existing ? { ...existing.chunk, score: Math.max(existing.chunk.score ?? 0, hit.score) } : snapshot,
      score: (existing?.score ?? 0) + rrf + hit.score * 0.05,
    });
  });

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({
      ...entry.chunk,
      rank: index + 1,
      score: entry.score,
      metadata: { ...entry.chunk.metadata, hybridScore: entry.score },
    }));
}
