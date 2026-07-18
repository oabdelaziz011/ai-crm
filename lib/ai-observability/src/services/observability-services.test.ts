import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionDeniedError } from "../errors.js";
import type {
  ExecutionAnalyticsRepository,
  TokenCostRepository,
  TraceRepository,
  TraceSpanRepository,
} from "../repositories/observability-repositories.js";
import { CostAccountingService } from "./cost-accounting-service.js";
import { ErrorCatalogService } from "./error-catalog-service.js";
import { ExecutionAnalyticsService } from "./execution-analytics-service.js";
import { TraceService } from "./trace-service.js";
import type {
  AIExecutionAnalyticsRecord,
  AITokenCostRecord,
  AITraceRecord,
  AITraceSpanRecord,
  ServiceContext,
  TraceStage,
} from "../types.js";
import { estimateTokenCost } from "../utils/cost-utils.js";
import { mapErrorCode } from "../utils/error-utils.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === "ai.analytics.view" || code === "ai.analytics.manage" || code === "ai.costs.view",
    ...overrides,
  };
}

function createEnvironment() {
  const traces: AITraceRecord[] = [];
  const spans: AITraceSpanRecord[] = [];
  const analytics: AIExecutionAnalyticsRecord[] = [];
  const costs: AITokenCostRecord[] = [];

  const traceRepository: TraceRepository = {
    create: async (input) => {
      const record: AITraceRecord = {
        id: `trace-record-${traces.length + 1}`,
        trace_id: input.traceId,
        correlation_id: input.correlationId,
        company_id: input.companyId,
        conversation_id: input.conversationId ?? null,
        status: "running",
        error_code: null,
        error_message: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        duration_ms: null,
        created_by: input.createdBy ?? null,
      };
      traces.push(record);
      return record;
    },
    update: async (input) => {
      const record = traces.find((item) => item.trace_id === input.traceId);
      if (!record) throw new Error("Trace not found");
      Object.assign(record, {
        status: input.status,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        duration_ms: input.durationMs ?? null,
        completed_at: input.completedAt ?? new Date().toISOString(),
      });
      return record;
    },
    findByTraceId: async (traceId) => traces.find((item) => item.trace_id === traceId) ?? null,
    findById: async (id) => traces.find((item) => item.id === id) ?? null,
    list: async (filter) =>
      traces.filter((item) => item.company_id === filter.companyId).slice(0, filter.limit ?? traces.length),
  };

  const spanRepository: TraceSpanRepository = {
    create: async (input) => {
      const record: AITraceSpanRecord = {
        id: `span-${spans.length + 1}`,
        company_id: input.companyId,
        trace_id: input.traceId,
        correlation_id: input.correlationId,
        stage: input.stage,
        status: "running",
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        metadata: input.metadata ?? {},
        error_code: null,
        error_message: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        duration_ms: null,
      };
      spans.push(record);
      return record;
    },
    update: async (input) => {
      const record = spans.find((item) => item.id === input.spanId);
      if (!record) throw new Error("Span not found");
      Object.assign(record, {
        status: input.status,
        metadata: input.metadata ?? record.metadata,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        duration_ms: input.durationMs ?? null,
        completed_at: input.completedAt ?? new Date().toISOString(),
      });
      return record;
    },
    findById: async (id) => spans.find((item) => item.id === id) ?? null,
    listByTraceId: async (traceId) => spans.filter((item) => item.trace_id === traceId),
    listByCorrelationId: async (correlationId) => spans.filter((item) => item.correlation_id === correlationId),
  };

  const analyticsRepository: ExecutionAnalyticsRepository = {
    create: async (input) => {
      const record: AIExecutionAnalyticsRecord = {
        id: `analytics-${analytics.length + 1}`,
        company_id: input.companyId,
        trace_id: input.traceId,
        correlation_id: input.correlationId,
        execution_id: input.executionId,
        conversation_id: input.conversationId,
        provider_key: input.providerKey,
        model: input.model,
        prompt_build_id: input.promptBuildId,
        template_key: input.templateKey,
        template_version_id: input.templateVersionId,
        latency_ms: input.latencyMs,
        retry_count: input.retryCount,
        used_fallback: input.usedFallback,
        had_timeout: input.hadTimeout,
        prompt_tokens: input.promptTokens,
        completion_tokens: input.completionTokens,
        total_tokens: input.totalTokens,
        estimated_cost: input.estimatedCost,
        currency: input.currency,
        execution_status: input.executionStatus,
        recorded_at: new Date().toISOString(),
      };
      analytics.push(record);
      return record;
    },
    list: async (filter) =>
      analytics.filter((item) => item.company_id === filter.companyId).slice(0, filter.limit ?? analytics.length),
  };

  const costRepository: TokenCostRepository = {
    create: async (input) => {
      const record: AITokenCostRecord = {
        id: `cost-${costs.length + 1}`,
        company_id: input.companyId,
        trace_id: input.traceId,
        execution_id: input.executionId,
        billing_period: input.billingPeriod,
        provider_key: input.providerKey,
        model: input.model,
        prompt_tokens: input.promptTokens,
        completion_tokens: input.completionTokens,
        total_tokens: input.totalTokens,
        estimated_cost: input.estimatedCost,
        currency: input.currency,
        recorded_at: new Date().toISOString(),
      };
      costs.push(record);
      return record;
    },
    list: async (filter) =>
      costs
        .filter(
          (item) =>
            item.company_id === filter.companyId &&
            (!filter.billingPeriod || item.billing_period === filter.billingPeriod),
        )
        .slice(0, filter.limit ?? costs.length),
  };

  const errors = new ErrorCatalogService();
  const costsService = new CostAccountingService(costRepository);
  const analyticsService = new ExecutionAnalyticsService(analyticsRepository, costsService);
  const traceService = new TraceService(traceRepository, spanRepository, errors);

  return { traceService, analyticsService, costsService, errors, traces, spans, analytics, costs };
}

describe("ErrorCatalogService", () => {
  it("normalizes known execution errors", () => {
    const service = new ErrorCatalogService();
    assert.equal(service.normalize({ code: "AI_EXECUTION_TIMEOUT", message: "Timed out" }).code, "timeout");
    assert.equal(service.mapCode("PERMISSION_DENIED"), "policy_violation");
    assert.equal(service.mapCode("something weird"), "unknown");
    assert.ok(service.catalog().length >= 7);
  });

  it("maps timeout-like messages", () => {
    assert.equal(mapErrorCode("provider request timeout"), "timeout");
  });
});

describe("CostAccountingService", () => {
  it("calculates token cost estimates", () => {
    const result = estimateTokenCost({ prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 });
    assert.ok(result.estimatedCost > 0);
    assert.equal(result.currency, "USD");
  });

  it("records and aggregates company costs", async () => {
    const env = createEnvironment();
    await env.costsService.recordTokenCost(createContext(), {
      companyId: "company-1",
      providerKey: "openai",
      model: "gpt-4o-mini",
      tokenUsage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
      billingPeriod: "2026-07",
    });

    const aggregate = await env.costsService.aggregateCompanyCosts(createContext(), {
      companyId: "company-1",
      billingPeriod: "2026-07",
    });

    assert.equal(aggregate.recordCount, 1);
    assert.equal(aggregate.totalTokens, 1500);
    assert.ok(aggregate.totalCost > 0);
    assert.ok(aggregate.byProvider.openai);
  });
});

describe("TraceService", () => {
  it("propagates trace and correlation identifiers across spans", async () => {
    const env = createEnvironment();
    const { context } = await env.traceService.startTrace(createContext(), {
      companyId: "company-1",
      conversationId: "conv-1",
    });

    const stages: TraceStage[] = [
      "conversation",
      "intent",
      "tool_router",
      "prompt_build",
      "ai_execution",
      "provider",
      "response",
    ];

    for (const stage of stages) {
      const span = await env.traceService.startSpan(createContext(), {
        companyId: "company-1",
        traceId: context.traceId,
        correlationId: context.correlationId,
        stage,
      });
      assert.equal(span.correlation_id, context.correlationId);
      await env.traceService.completeSpan(createContext(), { spanId: span.id });
    }

    const snapshot = await env.traceService.getTrace(createContext(), context.traceId);
    assert.equal(snapshot.spans.length, stages.length);
    assert.equal(new Set(snapshot.spans.map((span) => span.correlation_id)).size, 1);
  });

  it("rejects correlation mismatches", async () => {
    const env = createEnvironment();
    const { context } = await env.traceService.startTrace(createContext(), { companyId: "company-1" });

    await assert.rejects(
      () =>
        env.traceService.startSpan(createContext(), {
          companyId: "company-1",
          traceId: context.traceId,
          correlationId: "different-correlation",
          stage: "intent",
        }),
      /TRACE_CORRELATION_MISMATCH/,
    );
  });

  it("completes and fails traces with normalized errors", async () => {
    const env = createEnvironment();
    const { context } = await env.traceService.startTrace(createContext(), { companyId: "company-1" });

    const completed = await env.traceService.completeTrace(createContext(), { traceId: context.traceId });
    assert.equal(completed.status, "completed");

    const failedTrace = await env.traceService.startTrace(createContext(), { companyId: "company-1" });
    const failed = await env.traceService.failTrace(createContext(), {
      traceId: failedTrace.context.traceId,
      error: { code: "AI_EXECUTION_TIMEOUT", message: "Timed out" },
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.error_code, "timeout");
  });
});

describe("ExecutionAnalyticsService", () => {
  it("records analytics and cost records for an execution", async () => {
    const env = createEnvironment();
    const { context } = await env.traceService.startTrace(createContext(), { companyId: "company-1" });

    const record = await env.analyticsService.recordExecutionAnalytics(createContext(), {
      companyId: "company-1",
      traceContext: context,
      executionId: "exec-1",
      providerKey: "openai",
      model: "gpt-4o-mini",
      templateKey: "conversation_default",
      templateVersionId: "version-1",
      latencyMs: 420,
      retryCount: 1,
      usedFallback: false,
      hadTimeout: false,
      tokenUsage: { prompt_tokens: 800, completion_tokens: 200, total_tokens: 1000 },
      executionStatus: "succeeded",
    });

    assert.equal(record.total_tokens, 1000);
    assert.equal(env.costs.length, 1);
    assert.equal(record.correlation_id, context.correlationId);
  });

  it("aggregates execution metrics", async () => {
    const env = createEnvironment();
    const { context } = await env.traceService.startTrace(createContext(), { companyId: "company-1" });

    await env.analyticsService.recordExecutionAnalytics(createContext(), {
      companyId: "company-1",
      traceContext: context,
      providerKey: "openai",
      model: "gpt-4o-mini",
      latencyMs: 100,
      retryCount: 0,
      usedFallback: false,
      hadTimeout: false,
      tokenUsage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      executionStatus: "succeeded",
    });

    await env.analyticsService.recordExecutionAnalytics(createContext(), {
      companyId: "company-1",
      traceContext: context,
      providerKey: "claude",
      model: "claude-3-5-sonnet-latest",
      latencyMs: 300,
      retryCount: 2,
      usedFallback: true,
      hadTimeout: true,
      tokenUsage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
      executionStatus: "fallback",
    });

    const aggregate = await env.analyticsService.aggregateMetrics(createContext(), { companyId: "company-1" });
    assert.equal(aggregate.totalExecutions, 2);
    assert.equal(aggregate.totalRetries, 2);
    assert.equal(aggregate.fallbackCount, 1);
    assert.equal(aggregate.timeoutCount, 1);
    assert.equal(aggregate.totalTokens, 450);
    assert.ok(aggregate.byProvider.openai.executions === 1);
    assert.ok(aggregate.byProvider.claude.executions === 1);
  });

  it("requires analytics permissions", async () => {
    const env = createEnvironment();
    await assert.rejects(
      () => env.analyticsService.listAnalytics(createContext({ hasPermission: () => false }), { companyId: "company-1" }),
      PermissionDeniedError,
    );
  });
});
