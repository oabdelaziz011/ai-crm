import { VECTOR_QUERY_PERMISSIONS } from "../constants.js";
import type { VectorQueryRequest } from "../dto/vector-query-dto.js";
import {
  KnowledgeEmbeddingNotFoundError,
  PermissionDeniedError,
  ValidationError,
  VectorQueryErrorCatalogService,
  VectorCollectionNotFoundError,
  VectorStoreConnectionNotFoundError,
} from "../errors/error-catalog.js";
import type {
  IndexedVectorReadRepository,
  QueryExecutionRepository,
  QueryResultRepository,
  VectorStoreConnectionReader,
} from "../repositories/vector-query-repositories.js";
import type { ExecuteVectorQueryResult } from "../dto/vector-query-dto.js";
import type { ServiceContext } from "../types.js";
import { computeQueryChecksum, createCorrelationId } from "../utils/query-utils.js";
import { createStructuredLogEvent, logVectorQueryEvent } from "../utils/query-logger.js";
import type { VectorQueryPolicyService } from "./vector-query-policy-service.js";
import type { VectorQueryProviderRegistryService } from "./vector-query-provider-registry-service.js";
import type { VectorRankingService } from "./vector-ranking-service.js";
import type { VectorResultNormalizationService } from "./vector-result-normalization-service.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string, correlationId?: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(VECTOR_QUERY_PERMISSIONS.view, correlationId);
  }
}

function assertPermission(ctx: ServiceContext, permission: string, correlationId?: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission, correlationId);
  }
}

export class VectorQueryExecutionService {
  private readonly errorCatalog = new VectorQueryErrorCatalogService();

  constructor(
    private readonly executionRepository: QueryExecutionRepository,
    private readonly resultRepository: QueryResultRepository,
    private readonly connectionReader: VectorStoreConnectionReader,
    private readonly readRepository: IndexedVectorReadRepository,
    private readonly providerRegistry: VectorQueryProviderRegistryService,
    private readonly policyService: VectorQueryPolicyService,
    private readonly normalizationService: VectorResultNormalizationService,
    private readonly rankingService: VectorRankingService,
  ) {}

  async execute(ctx: ServiceContext, input: VectorQueryRequest): Promise<ExecuteVectorQueryResult> {
    const correlationId = createCorrelationId(input.correlationId);

    logVectorQueryEvent(
      createStructuredLogEvent("vector_query_validation_started", correlationId, {
        companyId: input.companyId,
        collectionId: input.collectionId,
      }),
    );

    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.execute, correlationId);
    assertCompanyAccess(ctx, input.companyId, correlationId);
    this.policyService.validateMetadataFilters(input.metadataFilters, correlationId);

    const startedAt = Date.now();

    const connection = await this.connectionReader.findById(input.connectionId);
    if (!connection || !connection.is_enabled) {
      throw new VectorStoreConnectionNotFoundError(input.connectionId, correlationId);
    }
    if (connection.company_id !== input.companyId) {
      throw new ValidationError("Vector store connection does not belong to the requested company.", correlationId);
    }

    const collection = await this.readRepository.resolveCollection(input.collectionId);
    if (!collection || !collection.is_active) {
      throw new VectorCollectionNotFoundError(input.collectionId, correlationId);
    }
    if (collection.company_id !== input.companyId) {
      throw new ValidationError("Vector collection does not belong to the requested company.", correlationId);
    }
    if (collection.connection_id !== connection.id) {
      throw new ValidationError("Vector collection does not belong to the selected connection.", correlationId);
    }

    const queryVector = await this.resolveQueryVector(input, correlationId);
    const policy = await this.policyService.resolvePolicy(ctx, input.companyId, {
      policyId: input.policyId,
      topK: input.topK,
      minimumSimilarityScore: input.minimumScore,
    });

    const queryChecksum = computeQueryChecksum({
      queryVector,
      collectionId: collection.id,
      metadataFilters: input.metadataFilters,
    });

    const execution = await this.executionRepository.createExecution({
      companyId: input.companyId,
      vectorStoreConnectionId: connection.id,
      collectionId: collection.id,
      embeddingId: input.embeddingId ?? null,
      policyId: policy.policyId,
      queryChecksum,
      provider: connection.provider_key,
      correlationId,
      metadata: {
        metadataFilters: input.metadataFilters ?? {},
        topK: policy.defaultTopK,
      },
    });

    try {
      const provider = await this.providerRegistry.resolveProviderInstance(ctx, connection);

      const providerResult = await provider.query({
        collectionName: collection.name,
        queryVector,
        topK: policy.maximumResults,
        metadataFilters: input.metadataFilters,
      });

      const normalizedHits = await this.normalizationService.normalizeHits(
        collection.id,
        providerResult.hits,
        correlationId,
      );
      const rankedHits = this.rankingService.rankResults(normalizedHits, policy, correlationId);

      const persistedResults = await this.resultRepository.saveResults(
        rankedHits.map((hit) => ({
          executionId: execution.id,
          indexedVectorId: hit.indexedVectorId,
          normalizedScore: hit.normalizedScore,
          providerScore: hit.providerScore,
          ranking: hit.ranking,
          metadata: hit.metadata,
        })),
      );

      const completed = await this.executionRepository.completeExecution(execution.id, {
        executionTimeMs: Date.now() - startedAt,
        resultCount: persistedResults.length,
        metadata: {
          ...execution.metadata,
          providerCapabilities: provider.supportedCapabilities(),
        },
      });

      logVectorQueryEvent(
        createStructuredLogEvent("vector_query_completed", correlationId, {
          companyId: input.companyId,
          provider: connection.provider_key,
          collectionId: collection.id,
          policyId: policy.policyId,
          resultCount: persistedResults.length,
          executionTimeMs: completed.execution_time_ms ?? 0,
        }),
      );

      return {
        execution: completed,
        results: persistedResults,
      };
    } catch (error) {
      const normalized = this.errorCatalog.normalize(error, correlationId);
      const failed = await this.executionRepository.failExecution(execution.id, {
        executionTimeMs: Date.now() - startedAt,
        errorMessage: normalized.developerMessage,
      });

      logVectorQueryEvent(
        createStructuredLogEvent("vector_query_failed", correlationId, {
          companyId: input.companyId,
          provider: connection.provider_key,
          collectionId: collection.id,
          policyId: policy.policyId,
          executionTimeMs: failed.execution_time_ms ?? 0,
          errorCode: normalized.code,
        }),
      );

      throw Object.assign(error instanceof Error ? error : new Error(normalized.developerMessage), {
        execution: failed,
        normalizedError: normalized,
      });
    }
  }

  private async resolveQueryVector(input: VectorQueryRequest, correlationId: string): Promise<number[]> {
    if (input.queryVector && input.queryVector.length > 0) {
      return input.queryVector;
    }

    if (!input.embeddingId) {
      throw new ValidationError("Either queryVector or embeddingId is required.", correlationId);
    }

    const embedding = await this.readRepository.resolveEmbedding(input.embeddingId);
    if (!embedding) {
      throw new KnowledgeEmbeddingNotFoundError(input.embeddingId, correlationId);
    }
    if (embedding.company_id !== input.companyId) {
      throw new ValidationError("Knowledge embedding does not belong to the requested company.", correlationId);
    }
    if (!embedding.is_active || embedding.status !== "active") {
      throw new ValidationError("Query embedding must be active.", correlationId);
    }

    return embedding.vector;
  }
}
