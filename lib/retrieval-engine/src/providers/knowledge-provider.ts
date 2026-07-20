import type { RetrievalContext, SemanticRetrievalRequest, SemanticRetrievalResponse } from "../dto/retrieval-dto.js";
import type { RetrievalOrchestrationEngine } from "../engines/retrieval-orchestration-engine.js";
import type { ServiceContext } from "../types.js";

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
  chunkCount: number;
  totalTokens: number;
  executionId: string;
  vectorQueryExecutionId: string;
  retrievalLatencyMs: number;
  rankingLatencyMs: number;
  policyId: string | null;
};

export type KnowledgePolicy = {
  maxChunks?: number;
  maxContextTokens?: number;
  allowedSourceIds?: string[];
  rankingStrategy?: string;
  minimumScore?: number;
  topK?: number;
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
    rankingStrategy: "similarity",
    minimumScore: 0.2,
    topK: 12,
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

function formatKnowledgeContext(chunks: RuntimeKnowledgeChunkSnapshot[]): string {
  return chunks
    .map((chunk, index) => {
      const title = chunk.documentTitle ?? `Source ${index + 1}`;
      return `[${title}] ${chunk.content}`;
    })
    .join("\n\n");
}

function mapRetrievalContext(context: RetrievalContext): RuntimeKnowledgeChunkSnapshot[] {
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

export function mapSemanticRetrievalResponse(response: SemanticRetrievalResponse): KnowledgeQueryResult {
  const chunks = mapRetrievalContext(response.context);
  return {
    contextText: formatKnowledgeContext(chunks),
    chunks,
    chunkCount: response.context.chunkCount,
    totalTokens: response.context.totalTokens,
    executionId: response.executionId,
    vectorQueryExecutionId: response.vectorQueryExecutionId,
    retrievalLatencyMs: response.executionTimeMs,
    rankingLatencyMs: Math.max(0, response.orchestrationTimeMs - response.executionTimeMs),
    policyId: response.policyId,
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
    const response = await this.deps.orchestration.retrieveFromQuestion(ctx, {
      ...input,
      topK: input.topK ?? policy.topK,
      minimumScore: input.minimumScore ?? policy.minimumScore,
      maxTokenBudget: input.maxTokenBudget ?? policy.maxContextTokens,
    });

    let chunks = mapRetrievalContext(response.context);
    chunks = this.deps.ranking.apply(policy.rankingStrategy, chunks);
    if (policy.maxChunks) chunks = chunks.slice(0, policy.maxChunks);

    return {
      ...mapSemanticRetrievalResponse(response),
      chunks,
      chunkCount: chunks.length,
      contextText: formatKnowledgeContext(chunks),
    };
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
