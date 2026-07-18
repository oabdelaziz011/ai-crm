import type { TraceService } from "@workspace/ai-observability";
import type { ServiceContext, VectorQueryTelemetryEvent, VectorQueryTelemetryPort } from "@workspace/vector-query";

/**
 * Bridges vector query executions to the AI Observability trace platform
 * using correlation identifiers already persisted on query executions.
 */
export function createVectorQueryObservabilityPort(
  traceService: TraceService,
  ctx: ServiceContext,
): VectorQueryTelemetryPort {
  return {
    async recordExecution(event: VectorQueryTelemetryEvent): Promise<void> {
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
        entityType: "vector_query_execution",
        metadata: {
          provider: event.provider,
          collectionId: event.collectionId,
          policyId: event.policyId,
          resultCount: event.resultCount,
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
          resultCount: event.resultCount,
          executionTimeMs: event.executionTimeMs,
        },
      });

      await traceService.completeTrace(ctx, {
        traceId: trace.id,
      });
    },
  };
}
