import type { RuntimeKnowledgeChunkSnapshot } from "@workspace/retrieval-engine";
import { rerankChunks } from "@workspace/retrieval-engine";
import { fuseHybridResults } from "@workspace/retrieval-engine";

export type KnowledgeChunkRankerInput = {
  chunks: RuntimeKnowledgeChunkSnapshot[];
  query: string;
  searchMode: "vector" | "keyword" | "hybrid";
  keywordHits?: Parameters<typeof fuseHybridResults>[0]["keywordHits"];
  rerank?: boolean;
  topK?: number;
  maxChunks?: number;
  minimumScore?: number;
};

export class KnowledgeChunkRanker {
  rank(input: KnowledgeChunkRankerInput): RuntimeKnowledgeChunkSnapshot[] {
    let chunks = [...input.chunks];

    if (input.searchMode === "hybrid" && input.keywordHits?.length) {
      chunks = fuseHybridResults({
        vectorChunks: chunks,
        keywordHits: input.keywordHits,
      });
    }

    if (input.minimumScore != null) {
      chunks = chunks.filter((chunk) => (chunk.score ?? 0) >= input.minimumScore!);
    }

    chunks = deduplicateChunks(chunks);

    if (input.rerank) {
      chunks = rerankChunks({
        chunks,
        query: input.query,
        topN: input.maxChunks ?? input.topK,
      });
    } else {
      chunks = [...chunks].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    const limit = input.maxChunks ?? input.topK ?? chunks.length;
    return chunks.slice(0, limit).map((chunk, index) => ({ ...chunk, rank: index + 1 }));
  }
}

function deduplicateChunks(chunks: RuntimeKnowledgeChunkSnapshot[]): RuntimeKnowledgeChunkSnapshot[] {
  const seenContent = new Set<string>();
  const seenIds = new Set<string>();
  const result: RuntimeKnowledgeChunkSnapshot[] = [];

  for (const chunk of chunks) {
    if (seenIds.has(chunk.id)) continue;

    const normalized = chunk.content.trim().toLowerCase().replace(/\s+/g, " ");
    if (normalized.length > 40) {
      const fingerprint = normalized.slice(0, 200);
      if (seenContent.has(fingerprint)) continue;
      seenContent.add(fingerprint);
    }

    seenIds.add(chunk.id);
    result.push(chunk);
  }

  return result;
}

export { deduplicateChunks };
