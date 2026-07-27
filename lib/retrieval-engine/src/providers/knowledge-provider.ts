import type { SemanticRetrievalRequest, SemanticRetrievalResponse } from "../dto/retrieval-dto.js";
import type { RetrievalOrchestrationEngine } from "../engines/retrieval-orchestration-engine.js";
import type { ServiceContext } from "../types.js";
import { fuseHybridResults } from "../services/hybrid-search-service.js";
import { rerankChunks } from "../services/reranking-service.js";
import { buildCitations, formatContextWithCitations, type KnowledgeCitation } from "../services/citation-engine.js";
import { computeRetrievalConfidence } from "../services/confidence-scoring.js";

export type KnowledgeQueryInput = SemanticRetrievalRequest & {
  policyKey?: string;
};

export type RuntimeKnowledgeChunkSnapshot = {
  id: string;
  content: string;
  score: number | null;
  rank: number;
  tokenCount: number;
  documentTitle?: string;
  metadata: Record<string, unknown>;
};

export type KnowledgeQueryResult = {
  contextText: string;
  chunks: RuntimeKnowledgeChunkSnapshot[];
  citations: KnowledgeCitation[];
  confidence: number;
  chunkCount: number;
  totalTokens: number;
  executionId: string;
  vectorQueryExecutionId: string;
  retrievalLatencyMs: number;
  rankingLatencyMs: number;
  policyId: string | null;
  searchMode: "vector" | "keyword" | "hybrid";
};

export type KnowledgePolicy = {
  maxChunks?: number;
  maxContextTokens?: number;
  allowedSourceIds?: string[];
  rankingStrategy?: string;
  minimumScore?: number;
  topK?: number;
  searchMode?: "vector" | "keyword" | "hybrid";
  rerank?: boolean;
};

export class KnowledgePolicyRegistry {
  private readonly policies = new Map<string, KnowledgePolicy>();

  register(key: string, policy: KnowledgePolicy): this {
    this.policies.set(key, policy);
    return this;
  }

  resolve(key?: string | null): KnowledgePolicy {
    return (key && this.policies.get(key)) || this.policies.get("default") || {};
  }
}

export function createDefaultKnowledgePolicyRegistry(): KnowledgePolicyRegistry {
  const registry = new KnowledgePolicyRegistry();
  registry.register("default", {
    maxChunks: 8,
    maxContextTokens: 2048,
    rankingStrategy: "hybrid",
    minimumScore: 0.2,
    topK: 12,
    searchMode: "hybrid",
    rerank: true,
  });
  return registry;
}

export class KnowledgeRankingRegistry {
  private readonly rankers = new Map<string, (chunks: RuntimeKnowledgeChunkSnapshot[]) => RuntimeKnowledgeChunkSnapshot[]>();

  register(key: string, ranker: (chunks: RuntimeKnowledgeChunkSnapshot[]) => RuntimeKnowledgeChunkSnapshot[]): this {
    this.rankers.set(key, ranker);
    return this;
  }

  apply(key: string | undefined, chunks: RuntimeKnowledgeChunkSnapshot[]): RuntimeKnowledgeChunkSnapshot[] {
    const ranker = this.rankers.get(key ?? "similarity");
    if (!ranker) return chunks;
    return ranker(chunks);
  }
}

export function createDefaultKnowledgeRankingRegistry(): KnowledgeRankingRegistry {
  const registry = new KnowledgeRankingRegistry();
  registry.register("similarity", (chunks) =>
    [...chunks].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
  );
  registry.register("hybrid", (chunks) =>
    [...chunks].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.rank - b.rank),
  );
  return registry;
}

function mapRetrievalContext(context: SemanticRetrievalResponse["context"]): RuntimeKnowledgeChunkSnapshot[] {
  return context.chunks.map((chunk) => ({
    id: chunk.knowledgeChunkId,
    content: chunk.content,
    score: chunk.normalizedScore,
    rank: chunk.selectionRank,
    tokenCount: chunk.tokenCount,
    documentTitle: typeof chunk.metadata.documentTitle === "string" ? chunk.metadata.documentTitle : undefined,
    metadata: chunk.metadata,
  }));
}

export function mapSemanticRetrievalResponse(
  response: SemanticRetrievalResponse,
  chunks: RuntimeKnowledgeChunkSnapshot[],
  searchMode: "vector" | "keyword" | "hybrid",
): KnowledgeQueryResult {
  const citations = buildCitations(chunks);
  return {
    contextText: formatContextWithCitations(chunks),
    chunks,
    citations,
    confidence: computeRetrievalConfidence(chunks),
    chunkCount: chunks.length,
    totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
    executionId: response.executionId,
    vectorQueryExecutionId: response.vectorQueryExecutionId,
    retrievalLatencyMs: response.executionTimeMs,
    rankingLatencyMs: Math.max(0, response.orchestrationTimeMs - response.executionTimeMs),
    policyId: response.policyId,
    searchMode,
  };
}

export class KnowledgeProvider {
  constructor(
    private readonly deps: {
      orchestration: RetrievalOrchestrationEngine;
      policies: KnowledgePolicyRegistry;
      ranking: KnowledgeRankingRegistry;
    },
  ) {}

  async retrieve(ctx: ServiceContext, input: KnowledgeQueryInput): Promise<KnowledgeQueryResult> {
    const policy = this.deps.policies.resolve(input.policyKey);
    const searchMode = input.searchMode ?? policy.searchMode ?? "vector";
    const shouldRerank = input.rerank ?? policy.rerank ?? false;

    const response = await this.deps.orchestration.retrieveFromQuestion(ctx, {
      ...input,
      searchMode: searchMode === "hybrid" ? "vector" : searchMode,
      topK: input.topK ?? policy.topK,
      minimumScore: input.minimumScore ?? policy.minimumScore,
      maxTokenBudget: input.maxTokenBudget ?? policy.maxContextTokens,
      sourceIds: input.sourceIds ?? policy.allowedSourceIds,
    });

    let chunks = mapRetrievalContext(response.context);

    if (searchMode === "hybrid") {
      const keywordHits = await this.deps.orchestration.getKeywordHits(
        {
          ...input,
          topK: input.topK ?? policy.topK,
          sourceIds: input.sourceIds ?? policy.allowedSourceIds,
        },
        input.question,
      );
      chunks = fuseHybridResults({ vectorChunks: chunks, keywordHits });
    }

    chunks = this.deps.ranking.apply(policy.rankingStrategy, chunks);

    if (shouldRerank) {
      chunks = rerankChunks({
        chunks,
        query: input.question,
        topN: policy.maxChunks ?? input.topK,
      });
    }

    if (policy.maxChunks) chunks = chunks.slice(0, policy.maxChunks);

    return mapSemanticRetrievalResponse(response, chunks, searchMode);
  }
}

export class KnowledgeProviderRegistry {
  private readonly providers = new Map<string, KnowledgeProvider>();

  register(key: string, provider: KnowledgeProvider): this {
    this.providers.set(key, provider);
    return this;
  }

  resolve(key?: string | null): KnowledgeProvider | undefined {
    if (key && this.providers.has(key)) return this.providers.get(key);
    return this.providers.get("default");
  }
}
