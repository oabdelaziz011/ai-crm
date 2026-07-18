import { VECTOR_QUERY_PERMISSIONS } from "../constants.js";
import {
  toNormalizedSearchResult,
  toVectorQueryResponse,
  type VectorQueryRequest,
  type VectorQueryResponse,
} from "../dto/vector-query-dto.js";
import { PermissionDeniedError, QueryExecutionNotFoundError } from "../errors/error-catalog.js";
import type { QueryExecutionRepository, QueryResultRepository } from "../repositories/vector-query-repositories.js";
import type { VectorQueryTelemetryPort } from "../ports/observability-port.js";
import type { ServiceContext } from "../types.js";
import { createStructuredLogEvent, logVectorQueryEvent, telemetryToLogEvent } from "../utils/query-logger.js";
import type { VectorQueryExecutionService } from "./vector-query-execution-service.js";
import type { VectorQueryPolicyService } from "./vector-query-policy-service.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(VECTOR_QUERY_PERMISSIONS.view);
  }
}

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

export class VectorQueryManagementService {
  constructor(
    private readonly executionService: VectorQueryExecutionService,
    private readonly policyService: VectorQueryPolicyService,
    private readonly executionRepository: QueryExecutionRepository,
    private readonly resultRepository: QueryResultRepository,
    private readonly telemetryPort: VectorQueryTelemetryPort,
  ) {}

  async executeQuery(ctx: ServiceContext, input: VectorQueryRequest): Promise<VectorQueryResponse> {
    try {
      const result = await this.executionService.execute(ctx, input);

      const response = toVectorQueryResponse({
        executionId: result.execution.id,
        correlationId: result.execution.correlation_id,
        executionTimeMs: result.execution.execution_time_ms ?? 0,
        provider: result.execution.provider,
        collectionId: result.execution.collection_id,
        policyId: result.execution.policy_id,
        results: result.results.map((item) =>
          toNormalizedSearchResult({
            indexedVectorId: item.indexed_vector_id,
            normalizedScore: item.normalized_score,
            ranking: item.ranking,
            metadata: item.metadata,
          }),
        ),
      });

      await this.telemetryPort.recordExecution({
        companyId: input.companyId,
        correlationId: response.correlationId ?? "",
        provider: response.provider,
        collectionId: response.collectionId,
        policyId: response.policyId,
        resultCount: response.resultCount,
        executionTimeMs: response.executionTimeMs,
      });

      logVectorQueryEvent(
        telemetryToLogEvent({
          companyId: input.companyId,
          correlationId: response.correlationId ?? "",
          provider: response.provider,
          collectionId: response.collectionId,
          policyId: response.policyId,
          resultCount: response.resultCount,
          executionTimeMs: response.executionTimeMs,
        }),
      );

      return response;
    } catch (error) {
      const execution = (error as { execution?: { company_id: string; correlation_id: string | null; provider: string; collection_id: string; policy_id: string | null; execution_time_ms: number | null; error_message: string | null } }).execution;
      if (execution) {
        await this.telemetryPort.recordExecution({
          companyId: execution.company_id,
          correlationId: execution.correlation_id ?? "",
          provider: execution.provider,
          collectionId: execution.collection_id,
          policyId: execution.policy_id,
          resultCount: 0,
          executionTimeMs: execution.execution_time_ms ?? 0,
          error: execution.error_message,
        });

        logVectorQueryEvent(
          createStructuredLogEvent("vector_query_failed", execution.correlation_id ?? "", {
            companyId: execution.company_id,
            provider: execution.provider,
            collectionId: execution.collection_id,
            policyId: execution.policy_id,
            executionTimeMs: execution.execution_time_ms ?? 0,
            errorCode: "VECTOR_QUERY_FAILED",
          }),
        );
      }
      throw error;
    }
  }

  async getExecution(ctx: ServiceContext, executionId: string) {
    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.view);
    const execution = await this.executionRepository.findExecution(executionId);
    if (!execution) throw new QueryExecutionNotFoundError(executionId);
    assertCompanyAccess(ctx, execution.company_id);

    const results = await this.resultRepository.listExecutionResults(executionId);
    return {
      response: toVectorQueryResponse({
        executionId: execution.id,
        correlationId: execution.correlation_id,
        executionTimeMs: execution.execution_time_ms ?? 0,
        provider: execution.provider,
        collectionId: execution.collection_id,
        policyId: execution.policy_id,
        results: results.map((item) =>
          toNormalizedSearchResult({
            indexedVectorId: item.indexed_vector_id,
            normalizedScore: item.normalized_score,
            ranking: item.ranking,
            metadata: item.metadata,
          }),
        ),
      }),
    };
  }

  async listExecutions(ctx: ServiceContext, companyId: string) {
    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.view);
    assertCompanyAccess(ctx, companyId);
    return this.executionRepository.findByCompany(companyId);
  }

  getPolicyService(): VectorQueryPolicyService {
    return this.policyService;
  }
}
