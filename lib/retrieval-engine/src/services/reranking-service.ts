import type { RuntimeKnowledgeChunkSnapshot } from "../providers/knowledge-provider.js";

export type RerankInput = {
  chunks: RuntimeKnowledgeChunkSnapshot[];
  query: string;
  topN?: number;
};

/**
 * Lightweight reranker — boosts title/heading overlap and normalizes scores.
 * Production deployments can swap for cross-encoder models.
 */
export function rerankChunks(input: RerankInput): RuntimeKnowledgeChunkSnapshot[] {
  const queryTerms = tokenize(input.query);
  const topN = input.topN ?? input.chunks.length;

  const scored = input.chunks.map((chunk) => {
    const contentTerms = tokenize(chunk.content);
    const titleTerms = tokenize(chunk.documentTitle ?? "");
    const heading = typeof chunk.metadata.sectionTitle === "string" ? chunk.metadata.sectionTitle : "";
    const headingTerms = tokenize(heading);

    const contentOverlap = overlapRatio(queryTerms, contentTerms);
    const titleOverlap = overlapRatio(queryTerms, titleTerms);
    const headingOverlap = overlapRatio(queryTerms, headingTerms);
    const baseScore = chunk.score ?? 0;

    const rerankScore =
      baseScore * 0.55 +
      contentOverlap * 0.25 +
      titleOverlap * 0.12 +
      headingOverlap * 0.08;

    return {
      ...chunk,
      score: rerankScore,
      metadata: {
        ...chunk.metadata,
        rerankScore,
        contentOverlap,
        titleOverlap,
      },
    };
  });

  return scored
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, topN)
    .map((chunk, index) => ({ ...chunk, rank: index + 1 }));
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 2),
  );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const term of a) {
    if (b.has(term)) overlap += 1;
  }
  return overlap / a.size;
}
