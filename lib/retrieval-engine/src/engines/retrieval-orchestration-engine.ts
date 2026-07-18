import type { SemanticRetrievalRequest, SemanticRetrievalResponse } from "../dto/retrieval-dto.js";
import { RETRIEVAL_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, ValidationError } from "../errors/error-catalog.js";
import type { QueryEmbeddingPort } from "../ports/query-embedding-port.js";
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
 * Never accesses pgvector or embedding providers directly.
 */
export class RetrievalOrchestrationEngine {
  constructor(
    private readonly queryEmbeddingPort: QueryEmbeddingPort,
    private readonly vectorQueryPort: VectorQueryExecutionPort,
    private readonly retrievalEngine: RetrievalEngine,
  ) {}

  async retrieveFromQuestion(
    ctx: ServiceContext,
    input: SemanticRetrievalRequest,
  ): Promise<SemanticRetrievalResponse> {
    const correlationId = createCorrelationId(input.correlationId);
    const startedAt = Date.now();

    logRetrievalEvent(
      createStructuredLogEvent("retrieval_orchestration_started", correlationId, {
        companyId: input.companyId,
        collectionId: input.collectionId,
      }),
    );

    assertPermission(ctx, RETRIEVAL_PERMISSIONS.execute, correlationId);
    assertCompanyAccess(ctx, input.companyId, correlationId);

    const question = input.question?.trim();
    if (!question) {
      throw new ValidationError("question is required.", correlationId);
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
    };

    logRetrievalEvent(
      createStructuredLogEvent("retrieval_orchestration_completed", correlationId, {
        companyId: input.companyId,
        executionId: response.executionId,
        vectorQueryExecutionId: response.vectorQueryExecutionId,
        chunksSelected: response.metrics.chunksSelected,
        orchestrationTimeMs: response.orchestrationTimeMs,
      }),
    );

    return response;
  }
}
