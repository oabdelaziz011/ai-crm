import type { RuntimeKnowledgeChunkSnapshot } from "../providers/knowledge-provider.js";

export function computeChunkConfidence(chunk: RuntimeKnowledgeChunkSnapshot): number {
  const score = chunk.score ?? 0;
  const normalizedScore = Math.min(1, Math.max(0, score));

  const channelBoost =
    chunk.metadata.retrieval_channel === "hybrid" || chunk.metadata.hybridScore
      ? 0.08
      : chunk.metadata.retrieval_channel === "vector"
        ? 0.05
        : 0.03;

  const rerankBoost = typeof chunk.metadata.rerankScore === "number" ? 0.05 : 0;
  const keywordBoost = typeof chunk.metadata.keywordScore === "number" ? 0.04 : 0;

  const confidence = Math.min(1, normalizedScore * 0.75 + channelBoost + rerankBoost + keywordBoost + rankBoost(chunk.rank));
  return Math.round(confidence * 1000) / 1000;
}

export function computeRetrievalConfidence(chunks: RuntimeKnowledgeChunkSnapshot[]): number {
  if (chunks.length === 0) return 0;
  const top = chunks.slice(0, 3);
  const avg = top.reduce((sum, chunk) => sum + computeChunkConfidence(chunk), 0) / top.length;
  return Math.round(avg * 1000) / 1000;
}

function rankBoost(rank: number): number {
  if (rank <= 1) return 0.1;
  if (rank <= 3) return 0.06;
  if (rank <= 5) return 0.03;
  return 0;
}
