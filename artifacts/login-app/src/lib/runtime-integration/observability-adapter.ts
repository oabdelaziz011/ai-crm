import type { ExecutionAnalyticsService, TraceService } from "@workspace/ai-observability";
import type { RuntimeTelemetryEvent, RuntimeTelemetryPort, ServiceContext } from "@workspace/runtime-integration";

export type RuntimeObservabilityServices = {
  trace: TraceService;
  analytics: ExecutionAnalyticsService;
};

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function createRuntimeObservabilityPort(
  services: RuntimeObservabilityServices,
  ctx: ServiceContext,
): RuntimeTelemetryPort {
  return {
    async recordExecution(event: RuntimeTelemetryEvent): Promise<void> {
      const canRecord =
        ctx.isSuperAdmin ||
        ctx.hasPermission("ai.analytics.manage") ||
        ctx.hasPermission("runtime.manage");

      if (!canRecord) {
        return;
      }

      try {
        const { trace, context } = await services.trace.startTrace(ctx, {
          companyId: event.companyId,
          correlationId: event.correlationId,
          conversationId: event.conversationId,
        });

        const span = await services.trace.startSpan(ctx, {
          companyId: event.companyId,
          traceId: context.traceId,
          correlationId: context.correlationId,
          stage: event.pipelineStage === "failed" ? "ai_execution" : "response",
          entityType: "runtime_execution",
          metadata: {
            runtimeId: event.runtimeId,
            executionId: event.executionId,
            conversationId: event.conversationId,
            intentKey: event.intentKey,
            providerKey: event.providerKey,
            model: event.model,
            pipelineStage: event.pipelineStage,
            executionTimeMs: event.executionTimeMs,
            latencyMs: event.latencyMs,
            tokenUsageTotal: event.tokenUsageTotal,
            aiExecutionId: event.aiExecutionId,
            promptBuildId: event.promptBuildId,
          },
        });

        if (event.error) {
          await services.trace.failSpan(ctx, {
            spanId: span.id,
            error: new Error(event.error),
            metadata: { traceId: trace.id },
          });
          await services.trace.failTrace(ctx, {
            traceId: context.traceId,
            error: new Error(event.error),
          });
          return;
        }

        await services.trace.completeSpan(ctx, {
          spanId: span.id,
          metadata: {
            executionTimeMs: event.executionTimeMs,
            latencyMs: event.latencyMs,
            tokenUsageTotal: event.tokenUsageTotal,
          },
        });

        await services.trace.completeTrace(ctx, {
          traceId: context.traceId,
        });

        if (event.providerKey && event.tokenUsage && event.tokenUsage.totalTokens > 0) {
          await services.analytics.recordExecutionAnalytics(ctx, {
            companyId: event.companyId,
            traceContext: context,
            executionId: event.aiExecutionId ?? event.executionId,
            conversationId: event.conversationId,
            providerKey: event.providerKey,
            model: event.model ?? "unknown",
            promptBuildId: event.promptBuildId ?? null,
            latencyMs: event.latencyMs ?? event.executionTimeMs,
            retryCount: event.retryCount ?? 0,
            usedFallback: event.usedFallback ?? false,
            hadTimeout: false,
            tokenUsage: {
              prompt_tokens: event.tokenUsage.promptTokens,
              completion_tokens: event.tokenUsage.completionTokens,
              total_tokens: event.tokenUsage.totalTokens,
            },
            executionStatus: event.pipelineStage === "failed" ? "failed" : "succeeded",
          });
        }
      } catch (error) {
        throw new Error(formatError(error));
      }
    },
  };
}
