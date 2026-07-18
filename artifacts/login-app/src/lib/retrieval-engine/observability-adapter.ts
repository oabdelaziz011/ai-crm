import type { TraceService } from "@workspace/ai-observability";
import type { RetrievalTelemetryEvent, RetrievalTelemetryPort, ServiceContext } from "@workspace/retrieval-engine";

/**
 * Bridges retrieval executions to the AI Observability trace platform.
 */
export function createRetrievalObservabilityPort(
  traceService: TraceService,
  ctx: ServiceContext,
): RetrievalTelemetryPort {
  return {
    async recordExecution(event: RetrievalTelemetryEvent): Promise<void> {
      if (!ctx.isSuperAdmin && !ctx.hasPermission("ai.analytics.manage")) {
        return;
      }

      const { trace, context } = await traceService.startTrace(ctx, {
        companyId: event.companyId,
        correlationId: event.correlationId,
      });

      const span = await traceService.startSpan(ctx, {
        companyId: event.companyId,
        traceId: context.traceId,
        correlationId: context.correlationId,
        stage: "provider",
        entityType: "retrieval_execution",
        metadata: {
          executionId: event.executionId,
          policyId: event.policyId,
          chunksSelected: event.chunksSelected,
          chunksRejected: event.chunksRejected,
          budgetUsedTokens: event.budgetUsedTokens,
          budgetTokens: event.budgetTokens,
          executionTimeMs: event.executionTimeMs,
        },
      });

      if (event.error) {
        await traceService.failSpan(ctx, {
          spanId: span.id,
          error: new Error(event.error),
          metadata: { traceId: trace.id },
        });
        await traceService.failTrace(ctx, {
          traceId: trace.id,
          error: new Error(event.error),
        });
        return;
      }

      await traceService.completeSpan(ctx, {
        spanId: span.id,
        metadata: {
          chunksSelected: event.chunksSelected,
          budgetUsedTokens: event.budgetUsedTokens,
          executionTimeMs: event.executionTimeMs,
        },
      });

      await traceService.completeTrace(ctx, {
        traceId: trace.id,
      });
    },
  };
}
