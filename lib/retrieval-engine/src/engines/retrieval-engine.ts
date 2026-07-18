import type { RetrievalRequest, RetrievalResponse } from "../dto/retrieval-dto.js";
import { toRetrievalContext, toRetrievalResponse } from "../dto/retrieval-dto.js";
import { RETRIEVAL_PERMISSIONS } from "../constants.js";
import {
  PermissionDeniedError,
  RetrievalErrorCatalogService,
  VectorQueryExecutionNotFoundError,
  VectorQueryExecutionNotReadyError,
  ValidationError,
} from "../errors/error-catalog.js";
import type { RetrievalTelemetryPort } from "../ports/observability-port.js";
import type {
  RetrievalContextRepository,
  RetrievalExecutionRepository,
  RetrievalMetricsRepository,
  VectorQueryReadRepository,
} from "../repositories/retrieval-repositories.js";
import type { ServiceContext } from "../types.js";
import { createCorrelationId } from "../utils/retrieval-utils.js";
import { createStructuredLogEvent, logRetrievalEvent, telemetryToLogEvent } from "../utils/retrieval-logger.js";
import { ContextAssemblyEngine } from "./context-assembly-engine.js";
import { ContextBudgetEngine } from "./context-budget-engine.js";
import { ContextSelectionEngine } from "./context-selection-engine.js";
import { RetrievalMetricsEngine } from "./retrieval-metrics-engine.js";
import { RetrievalPolicyEngine } from "./retrieval-policy-engine.js";

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

export class RetrievalEngine {
  private readonly errorCatalog = new RetrievalErrorCatalogService();

  constructor(
    private readonly policyEngine: RetrievalPolicyEngine,
    private readonly selectionEngine: ContextSelectionEngine,
    private readonly budgetEngine: ContextBudgetEngine,
    private readonly assemblyEngine: ContextAssemblyEngine,
    private readonly metricsEngine: RetrievalMetricsEngine,
    private readonly executionRepository: RetrievalExecutionRepository,
    private readonly contextRepository: RetrievalContextRepository,
    private readonly metricsRepository: RetrievalMetricsRepository,
    private readonly vectorQueryReader: VectorQueryReadRepository,
    private readonly telemetryPort: RetrievalTelemetryPort,
  ) {}

  async retrieve(ctx: ServiceContext, input: RetrievalRequest): Promise<RetrievalResponse> {
    const correlationId = createCorrelationId(input.correlationId);
    const startedAt = Date.now();

    logRetrievalEvent(
      createStructuredLogEvent("retrieval_validation_started", correlationId, {
        companyId: input.companyId,
      }),
    );

    assertPermission(ctx, RETRIEVAL_PERMISSIONS.execute, correlationId);
    assertCompanyAccess(ctx, input.companyId, correlationId);

    if (!input.vectorQueryExecutionId) {
      throw new ValidationError("vectorQueryExecutionId is required.", correlationId);
    }

    const vectorExecution = await this.vectorQueryReader.findExecution(input.vectorQueryExecutionId);
    if (!vectorExecution) {
      throw new VectorQueryExecutionNotFoundError(input.vectorQueryExecutionId, correlationId);
    }
    if (vectorExecution.companyId !== input.companyId) {
      throw new ValidationError("Vector query execution does not belong to the requested company.", correlationId);
    }
    if (vectorExecution.executionStatus !== "completed") {
      throw new VectorQueryExecutionNotReadyError(input.vectorQueryExecutionId, correlationId);
    }

    const policy = await this.policyEngine.resolvePolicy(
      ctx,
      input.companyId,
      {
        policyId: input.policyId,
        maxTokenBudget: input.maxTokenBudget,
      },
      correlationId,
    );

    const execution = await this.executionRepository.createExecution({
      companyId: input.companyId,
      vectorQueryExecutionId: input.vectorQueryExecutionId,
      policyId: policy.policyId,
      correlationId,
      metadata: {
        vectorQueryExecutionId: input.vectorQueryExecutionId,
      },
    });

    try {
      const candidates = await this.selectionEngine.buildCandidates(
        input.vectorQueryExecutionId,
        policy,
        correlationId,
      );
      const { selected, rejected } = this.selectionEngine.selectChunks(candidates, policy, correlationId);
      const { included, discardedBudget } = this.budgetEngine.enforceBudget(selected, policy);
      const { chunks, contextChecksum, totalTokens } = this.assemblyEngine.assemble(included, correlationId);
      const metrics = this.metricsEngine.computeMetrics({
        startedAt,
        policy,
        selectedCount: chunks.length,
        rejectedCount: rejected,
        discardedBudget,
        assembledChunks: chunks,
      });

      const contextRecord = await this.contextRepository.createContext({
        companyId: input.companyId,
        executionId: execution.id,
        contextChecksum,
        chunkCount: chunks.length,
        totalTokens,
        metadata: {
          policyId: policy.policyId,
        },
      });

      await this.contextRepository.saveContextChunks(
        chunks.map((chunk) => ({
          contextId: contextRecord.id,
          knowledgeChunkId: chunk.knowledgeChunkId,
          indexedVectorId: chunk.indexedVectorId,
          selectionRank: chunk.selectionRank,
          normalizedScore: chunk.normalizedScore,
          tokenCount: chunk.tokenCount,
          content: chunk.content,
          metadata: chunk.metadata,
        })),
      );

      await this.metricsRepository.saveMetrics({
        companyId: input.companyId,
        executionId: execution.id,
        policyId: policy.policyId,
        durationMs: metrics.durationMs,
        chunksSelected: metrics.chunksSelected,
        chunksRejected: metrics.chunksRejected,
        chunksDiscardedBudget: metrics.chunksDiscardedBudget,
        budgetTokens: metrics.budgetTokens,
        budgetUsedTokens: metrics.budgetUsedTokens,
      });

      const completed = await this.executionRepository.completeExecution(execution.id, {
        executionTimeMs: metrics.durationMs,
        metadata: {
          ...execution.metadata,
          contextId: contextRecord.id,
        },
      });

      const contextDto = toRetrievalContext({
        contextId: contextRecord.id,
        executionId: completed.id,
        chunkCount: chunks.length,
        totalTokens,
        chunks,
        metadata: contextRecord.metadata,
      });

      const response = toRetrievalResponse({
        executionId: completed.id,
        correlationId: completed.correlation_id,
        executionTimeMs: completed.execution_time_ms ?? metrics.durationMs,
        policyId: policy.policyId,
        context: contextDto,
        metrics: {
          chunksSelected: metrics.chunksSelected,
          chunksRejected: metrics.chunksRejected,
          chunksDiscardedBudget: metrics.chunksDiscardedBudget,
          budgetTokens: metrics.budgetTokens,
          budgetUsedTokens: metrics.budgetUsedTokens,
        },
      });

      await this.telemetryPort.recordExecution({
        companyId: input.companyId,
        correlationId,
        executionId: completed.id,
        policyId: policy.policyId,
        chunksSelected: metrics.chunksSelected,
        chunksRejected: metrics.chunksRejected,
        budgetUsedTokens: metrics.budgetUsedTokens,
        budgetTokens: metrics.budgetTokens,
        executionTimeMs: completed.execution_time_ms ?? metrics.durationMs,
      });

      logRetrievalEvent(
        telemetryToLogEvent({
          companyId: input.companyId,
          correlationId,
          executionId: completed.id,
          policyId: policy.policyId,
          chunksSelected: metrics.chunksSelected,
          chunksRejected: metrics.chunksRejected,
          budgetUsedTokens: metrics.budgetUsedTokens,
          budgetTokens: metrics.budgetTokens,
          executionTimeMs: completed.execution_time_ms ?? metrics.durationMs,
        }),
      );

      return response;
    } catch (error) {
      const normalized = this.errorCatalog.normalize(error, correlationId);
      const failed = await this.executionRepository.failExecution(execution.id, {
        executionTimeMs: Date.now() - startedAt,
        errorMessage: normalized.developerMessage,
      });

      await this.telemetryPort.recordExecution({
        companyId: input.companyId,
        correlationId,
        executionId: failed.id,
        policyId: policy.policyId,
        chunksSelected: 0,
        chunksRejected: 0,
        budgetUsedTokens: 0,
        budgetTokens: policy.maxContextTokens,
        executionTimeMs: failed.execution_time_ms ?? 0,
        error: normalized.developerMessage,
      });

      logRetrievalEvent(
        createStructuredLogEvent("retrieval_failed", correlationId, {
          companyId: input.companyId,
          executionId: failed.id,
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
}
