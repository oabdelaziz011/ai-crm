import type { KnowledgeProvider } from "@workspace/retrieval-engine";
import { KnowledgeRuntimeCache } from "../cache/knowledge-runtime-cache.js";
import { KnowledgeContextBuilder } from "../builder/knowledge-context-builder.js";
import {
  KnowledgeSearchCoordinator,
  type KnowledgeAccessContext,
  type KnowledgeSearchInput,
  type MissingEmbeddingQueuePort,
} from "../coordinator/knowledge-search-coordinator.js";
import type { KnowledgeContextDto } from "../dto/knowledge-context-dto.js";
import { isLikelyKnowledgeQuestion } from "../utils/query-normalizer.js";

export type KnowledgeRuntimeSearchInput = KnowledgeSearchInput;

export class KnowledgeRuntimeProvider {
  private readonly cache: KnowledgeRuntimeCache;
  private readonly coordinator: KnowledgeSearchCoordinator;
  private readonly contextBuilder = new KnowledgeContextBuilder();

  constructor(
    knowledge: KnowledgeProvider,
    options?: {
      cache?: KnowledgeRuntimeCache;
      cacheTtlSeconds?: number;
      embeddingQueue?: MissingEmbeddingQueuePort;
    },
  ) {
    this.cache = options?.cache ?? new KnowledgeRuntimeCache({ ttlSeconds: options?.cacheTtlSeconds });
    this.coordinator = new KnowledgeSearchCoordinator(knowledge, {
      embeddingQueue: options?.embeddingQueue,
    });
  }

  async retrieve(ctx: KnowledgeAccessContext, input: KnowledgeRuntimeSearchInput): Promise<KnowledgeContextDto> {
    if (!isLikelyKnowledgeQuestion(input.question)) {
      return emptyContext();
    }

    return this.retrieveCached(ctx, input);
  }

  /**
   * Explicit tool-driven retrieval (e.g. AI Employee `knowledge_search`).
   * Skips the heuristic question filter — the tool call itself signals intent.
   */
  async retrieveForTool(
    ctx: KnowledgeAccessContext,
    input: KnowledgeRuntimeSearchInput,
  ): Promise<KnowledgeContextDto> {
    return this.retrieveCached(ctx, input);
  }

  private async retrieveCached(
    ctx: KnowledgeAccessContext,
    input: KnowledgeRuntimeSearchInput,
  ): Promise<KnowledgeContextDto> {
    const cacheKey = this.cache.buildKey({
      companyId: input.companyId,
      collectionId: input.collectionId,
      question: input.question,
      policyKey: input.policyKey,
    });

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cacheHit: true };
    }

    const result = await this.coordinator.search(ctx, input);
    const context = this.contextBuilder.build(result, {
      query: input.question,
      rerank: input.rerank ?? true,
      minimumScore: input.minimumScore,
    });

    if (context.chunkCount > 0) {
      await this.cache.set(cacheKey, context);
    }

    return context;
  }

  toPromptKnowledge(context: KnowledgeContextDto | null | undefined) {
    if (!context || context.chunkCount === 0) return undefined;
    return {
      contextText: context.contextText,
      chunkCount: context.chunkCount,
      totalTokens: context.totalTokens,
      executionId: context.executionId,
      confidence: context.confidence,
      searchMode: context.searchMode,
      citations: context.citations,
      chunks: context.chunks.map((chunk) => ({
        id: chunk.id,
        content: chunk.chunkText,
        score: chunk.score,
        documentTitle: chunk.documentTitle,
        sectionTitle: chunk.sectionTitle,
        confidence: chunk.confidence,
        citationId: chunk.citation.citationId,
      })),
    };
  }

  toRetrievalSnapshot(context: KnowledgeContextDto | null | undefined) {
    if (!context || context.chunkCount === 0) return null;
    return this.contextBuilder.toRetrievalSnapshot(context);
  }
}

function emptyContext(): KnowledgeContextDto {
  return {
    contextText: "",
    chunks: [],
    citations: [],
    chunkCount: 0,
    totalTokens: 0,
    confidence: 0,
    executionId: "",
    vectorQueryExecutionId: "",
    searchMode: "hybrid",
    retrievalLatencyMs: 0,
    rankingLatencyMs: 0,
    policyId: null,
    cacheHit: false,
  };
}

export function createKnowledgeRuntimeProvider(
  knowledge: KnowledgeProvider,
  options?: ConstructorParameters<typeof KnowledgeRuntimeProvider>[1],
): KnowledgeRuntimeProvider {
  return new KnowledgeRuntimeProvider(knowledge, options);
}
