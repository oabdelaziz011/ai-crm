import type { SemanticRetrievalRequest, SemanticRetrievalResponse } from "../dto/retrieval-dto.js";
import { RETRIEVAL_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, ValidationError } from "../errors/error-catalog.js";
import type { QueryEmbeddingPort } from "../ports/query-embedding-port.js";
import type { KeywordSearchPort } from "../ports/keyword-search-port.js";
import type { VectorQueryExecutionPort } from "../ports/vector-query-execution-port.js";
import type { ServiceContext } from "../types.js";
import { createCorrelationId } from "../utils/retrieval-utils.js";
import { createStructuredLogEvent, logRetrievalEvent } from "../utils/retrieval-logger.js";
import type { RetrievalEngine } from "./retrieval-engine.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string, correlationId?: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(RETRIEVAL_PERMISSIONS.view, correlationId);
  }
}

function assertPermission(ctx: ServiceContext, permission: string, correlationId?: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission, correlationId);
  }
}

/**
 * End-to-end semantic retrieval orchestrator.
 * Chains: question → query embedding → vector query → context assembly.
 * Supports hybrid mode via keyword search port (FTS).
 */
export class RetrievalOrchestrationEngine {
  constructor(
    private readonly queryEmbeddingPort: QueryEmbeddingPort,
    private readonly vectorQueryPort: VectorQueryExecutionPort,
    private readonly retrievalEngine: RetrievalEngine,
    private readonly keywordSearchPort?: KeywordSearchPort,
  ) {}

  async retrieveFromQuestion(
    ctx: ServiceContext,
    input: SemanticRetrievalRequest,
  ): Promise<SemanticRetrievalResponse> {
    const correlationId = createCorrelationId(input.correlationId);
    const startedAt = Date.now();
    const searchMode = input.searchMode ?? "vector";

    logRetrievalEvent(
      createStructuredLogEvent("retrieval_orchestration_started", correlationId, {
        companyId: input.companyId,
        collectionId: input.collectionId,
        searchMode,
      }),
    );

    assertPermission(ctx, RETRIEVAL_PERMISSIONS.execute, correlationId);
    assertCompanyAccess(ctx, input.companyId, correlationId);

    const question = input.question?.trim();
    if (!question) {
      throw new ValidationError("question is required.", correlationId);
    }

    if (searchMode === "keyword") {
      return this.retrieveKeywordOnly(ctx, input, question, correlationId, startedAt);
    }

    if (!input.embeddingConnectionId) {
      throw new ValidationError("embeddingConnectionId is required.", correlationId);
    }
    if (!input.vectorStoreConnectionId) {
      throw new ValidationError("vectorStoreConnectionId is required.", correlationId);
    }
    if (!input.collectionId) {
      throw new ValidationError("collectionId is required.", correlationId);
    }

    const queryEmbedding = await this.queryEmbeddingPort.generateQueryEmbedding(ctx, {
      companyId: input.companyId,
      connectionId: input.embeddingConnectionId,
      text: question,
      model: input.embeddingModel,
      correlationId,
    });

    logRetrievalEvent(
      createStructuredLogEvent("retrieval_query_embedding_completed", correlationId, {
        companyId: input.companyId,
        providerKey: queryEmbedding.providerKey,
        dimensions: queryEmbedding.dimensions,
      }),
    );

    const vectorQuery = await this.vectorQueryPort.executeVectorQuery(ctx, {
      companyId: input.companyId,
      connectionId: input.vectorStoreConnectionId,
      collectionId: input.collectionId,
      queryVector: queryEmbedding.vector,
      policyId: input.vectorQueryPolicyId,
      topK: input.topK,
      minimumScore: input.minimumScore,
      metadataFilters: input.metadataFilters,
      correlationId,
    });

    logRetrievalEvent(
      createStructuredLogEvent("retrieval_vector_query_completed", correlationId, {
        companyId: input.companyId,
        vectorQueryExecutionId: vectorQuery.executionId,
        resultCount: vectorQuery.resultCount,
      }),
    );

    const retrieval = await this.retrievalEngine.retrieve(ctx, {
      companyId: input.companyId,
      vectorQueryExecutionId: vectorQuery.executionId,
      policyId: input.retrievalPolicyId,
      maxTokenBudget: input.maxTokenBudget,
      correlationId,
    });

    const response: SemanticRetrievalResponse = {
      ...retrieval,
      vectorQueryExecutionId: vectorQuery.executionId,
      queryEmbedding: {
        dimensions: queryEmbedding.dimensions,
        providerKey: queryEmbedding.providerKey,
        model: queryEmbedding.model,
      },
      orchestrationTimeMs: Date.now() - startedAt,
      context: {
        ...retrieval.context,
        metadata: {
          ...retrieval.context.metadata,
          searchMode,
          keywordHitCount: searchMode === "hybrid" ? await this.countKeywordHits(input, question) : 0,
        },
      },
    };

    logRetrievalEvent(
      createStructuredLogEvent("retrieval_orchestration_completed", correlationId, {
        companyId: input.companyId,
        executionId: response.executionId,
        vectorQueryExecutionId: response.vectorQueryExecutionId,
        chunksSelected: response.metrics.chunksSelected,
        orchestrationTimeMs: response.orchestrationTimeMs,
        searchMode,
      }),
    );

    return response;
  }

  getKeywordHits(input: SemanticRetrievalRequest, question: string) {
    if (!this.keywordSearchPort) return Promise.resolve([]);
    return this.keywordSearchPort.search({
      companyId: input.companyId,
      query: question,
      limit: input.topK ?? 20,
      sourceIds: input.sourceIds,
      documentIds: input.documentIds,
    });
  }

  private async countKeywordHits(input: SemanticRetrievalRequest, question: string): Promise<number> {
    const hits = await this.getKeywordHits(input, question);
    return hits.length;
  }

  private async retrieveKeywordOnly(
    ctx: ServiceContext,
    input: SemanticRetrievalRequest,
    question: string,
    correlationId: string,
    startedAt: number,
  ): Promise<SemanticRetrievalResponse> {
    if (!this.keywordSearchPort) {
      throw new ValidationError("Keyword search is not configured.", correlationId);
    }

    const hits = await this.keywordSearchPort.search({
      companyId: input.companyId,
      query: question,
      limit: input.topK ?? 12,
      sourceIds: input.sourceIds,
      documentIds: input.documentIds,
    });

    const chunks = hits.map((hit, index) => ({
      knowledgeChunkId: hit.chunkId,
      indexedVectorId: null,
      selectionRank: index + 1,
      normalizedScore: hit.score,
      tokenCount: Math.ceil(hit.content.length / 4),
      content: hit.content,
      metadata: {
        documentId: hit.documentId,
        sourceId: hit.sourceId,
        documentTitle: hit.documentTitle,
        sectionTitle: hit.sectionTitle,
        pageNumber: hit.pageNumber,
        retrieval_channel: "keyword",
      },
      references: {
        documentId: hit.documentId,
        sourceId: hit.sourceId,
      },
    }));

    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);

    return {
      executionId: crypto.randomUUID(),
      correlationId,
      executionTimeMs: Date.now() - startedAt,
      policyId: input.retrievalPolicyId ?? null,
      vectorQueryExecutionId: "keyword-only",
      queryEmbedding: {
        dimensions: 0,
        providerKey: "fts",
        model: "postgres-tsvector",
      },
      orchestrationTimeMs: Date.now() - startedAt,
      context: {
        contextId: crypto.randomUUID(),
        executionId: crypto.randomUUID(),
        chunkCount: chunks.length,
        totalTokens,
        chunks,
        metadata: { searchMode: "keyword" },
      },
      metrics: {
        chunksSelected: chunks.length,
        chunksRejected: 0,
        chunksDiscardedBudget: 0,
        budgetTokens: input.maxTokenBudget ?? 2048,
        budgetUsedTokens: totalTokens,
      },
    };
  }
}
