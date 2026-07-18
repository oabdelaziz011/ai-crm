import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExecutionAnalyticsRepository,
  TokenCostRepository,
  TraceRepository,
  TraceSpanRepository,
} from "./observability-repositories.js";
import type { SpanStatus, TraceStatus } from "../constants.js";
import type {
  AIExecutionAnalyticsRecord,
  AITokenCostRecord,
  AITraceRecord,
  AITraceSpanRecord,
  CreateExecutionAnalyticsInput,
  CreateSpanInput,
  CreateTokenCostInput,
  CreateTraceInput,
  ListAnalyticsFilter,
  ListCostRecordsFilter,
  ListTracesFilter,
  UpdateSpanInput,
  UpdateTraceInput,
} from "../types.js";

const TRACES_TABLE = "ai_traces";
const SPANS_TABLE = "ai_trace_spans";
const ANALYTICS_TABLE = "ai_execution_analytics";
const COSTS_TABLE = "ai_token_cost_records";

function mapTrace(row: Record<string, unknown>): AITraceRecord {
  return {
    id: row.id as string,
    trace_id: row.trace_id as string,
    correlation_id: row.correlation_id as string,
    company_id: row.company_id as string,
    conversation_id: (row.conversation_id as string | null) ?? null,
    status: row.status as TraceStatus,
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    started_at: row.started_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    created_by: (row.created_by as string | null) ?? null,
  };
}

function mapSpan(row: Record<string, unknown>): AITraceSpanRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    trace_id: row.trace_id as string,
    correlation_id: row.correlation_id as string,
    stage: row.stage as AITraceSpanRecord["stage"],
    status: row.status as SpanStatus,
    entity_type: (row.entity_type as string | null) ?? null,
    entity_id: (row.entity_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    started_at: row.started_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
  };
}

function mapAnalytics(row: Record<string, unknown>): AIExecutionAnalyticsRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    trace_id: (row.trace_id as string | null) ?? null,
    correlation_id: row.correlation_id as string,
    execution_id: (row.execution_id as string | null) ?? null,
    conversation_id: (row.conversation_id as string | null) ?? null,
    provider_key: row.provider_key as string,
    model: row.model as string,
    prompt_build_id: (row.prompt_build_id as string | null) ?? null,
    template_key: (row.template_key as string | null) ?? null,
    template_version_id: (row.template_version_id as string | null) ?? null,
    latency_ms: Number(row.latency_ms ?? 0),
    retry_count: Number(row.retry_count ?? 0),
    used_fallback: Boolean(row.used_fallback),
    had_timeout: Boolean(row.had_timeout),
    prompt_tokens: Number(row.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? 0),
    total_tokens: Number(row.total_tokens ?? 0),
    estimated_cost: Number(row.estimated_cost ?? 0),
    currency: row.currency as string,
    execution_status: row.execution_status as string,
    recorded_at: row.recorded_at as string,
  };
}

function mapCost(row: Record<string, unknown>): AITokenCostRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    trace_id: (row.trace_id as string | null) ?? null,
    execution_id: (row.execution_id as string | null) ?? null,
    billing_period: row.billing_period as string,
    provider_key: row.provider_key as string,
    model: row.model as string,
    prompt_tokens: Number(row.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? 0),
    total_tokens: Number(row.total_tokens ?? 0),
    estimated_cost: Number(row.estimated_cost ?? 0),
    currency: row.currency as string,
    recorded_at: row.recorded_at as string,
  };
}

export function createSupabaseTraceRepository(client: SupabaseClient): TraceRepository {
  return {
    async create(input: CreateTraceInput): Promise<AITraceRecord> {
      const { data, error } = await client
        .from(TRACES_TABLE)
        .insert({
          trace_id: input.traceId,
          correlation_id: input.correlationId,
          company_id: input.companyId,
          conversation_id: input.conversationId ?? null,
          status: "running",
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapTrace(data as Record<string, unknown>);
    },

    async update(input: UpdateTraceInput): Promise<AITraceRecord> {
      const trace = await this.findByTraceId(input.traceId);
      if (!trace) throw new Error("Trace not found");

      const { data, error } = await client
        .from(TRACES_TABLE)
        .update({
          status: input.status,
          error_code: input.errorCode ?? null,
          error_message: input.errorMessage ?? null,
          duration_ms: input.durationMs ?? null,
          completed_at: input.completedAt ?? new Date().toISOString(),
        })
        .eq("id", trace.id)
        .select("*")
        .single();
      if (error) throw error;
      return mapTrace(data as Record<string, unknown>);
    },

    async findByTraceId(traceId: string): Promise<AITraceRecord | null> {
      const { data, error } = await client.from(TRACES_TABLE).select("*").eq("trace_id", traceId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapTrace(data as Record<string, unknown>);
    },

    async findById(id: string): Promise<AITraceRecord | null> {
      const { data, error } = await client.from(TRACES_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapTrace(data as Record<string, unknown>);
    },

    async list(filter: ListTracesFilter): Promise<AITraceRecord[]> {
      let query = client
        .from(TRACES_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .order("started_at", { ascending: false });
      if (filter.conversationId) query = query.eq("conversation_id", filter.conversationId);
      if (filter.correlationId) query = query.eq("correlation_id", filter.correlationId);
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.limit) query = query.limit(filter.limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapTrace(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseTraceSpanRepository(client: SupabaseClient): TraceSpanRepository {
  return {
    async create(input: CreateSpanInput): Promise<AITraceSpanRecord> {
      const { data, error } = await client
        .from(SPANS_TABLE)
        .insert({
          company_id: input.companyId,
          trace_id: input.traceId,
          correlation_id: input.correlationId,
          stage: input.stage,
          status: "running",
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapSpan(data as Record<string, unknown>);
    },

    async update(input: UpdateSpanInput): Promise<AITraceSpanRecord> {
      const { data, error } = await client
        .from(SPANS_TABLE)
        .update({
          status: input.status,
          metadata: input.metadata,
          error_code: input.errorCode ?? null,
          error_message: input.errorMessage ?? null,
          duration_ms: input.durationMs ?? null,
          completed_at: input.completedAt ?? new Date().toISOString(),
        })
        .eq("id", input.spanId)
        .select("*")
        .single();
      if (error) throw error;
      return mapSpan(data as Record<string, unknown>);
    },

    async findById(id: string): Promise<AITraceSpanRecord | null> {
      const { data, error } = await client.from(SPANS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapSpan(data as Record<string, unknown>);
    },

    async listByTraceId(traceId: string): Promise<AITraceSpanRecord[]> {
      const { data, error } = await client
        .from(SPANS_TABLE)
        .select("*")
        .eq("trace_id", traceId)
        .order("started_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapSpan(row as Record<string, unknown>));
    },

    async listByCorrelationId(correlationId: string): Promise<AITraceSpanRecord[]> {
      const { data, error } = await client
        .from(SPANS_TABLE)
        .select("*")
        .eq("correlation_id", correlationId)
        .order("started_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapSpan(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseExecutionAnalyticsRepository(
  client: SupabaseClient,
): ExecutionAnalyticsRepository {
  return {
    async create(input: CreateExecutionAnalyticsInput): Promise<AIExecutionAnalyticsRecord> {
      const { data, error } = await client
        .from(ANALYTICS_TABLE)
        .insert({
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
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapAnalytics(data as Record<string, unknown>);
    },

    async list(filter: ListAnalyticsFilter): Promise<AIExecutionAnalyticsRecord[]> {
      let query = client
        .from(ANALYTICS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .order("recorded_at", { ascending: false });
      if (filter.correlationId) query = query.eq("correlation_id", filter.correlationId);
      if (filter.providerKey) query = query.eq("provider_key", filter.providerKey);
      if (filter.from) query = query.gte("recorded_at", filter.from);
      if (filter.to) query = query.lte("recorded_at", filter.to);
      if (filter.limit) query = query.limit(filter.limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapAnalytics(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseTokenCostRepository(client: SupabaseClient): TokenCostRepository {
  return {
    async create(input: CreateTokenCostInput): Promise<AITokenCostRecord> {
      const { data, error } = await client
        .from(COSTS_TABLE)
        .insert({
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
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapCost(data as Record<string, unknown>);
    },

    async list(filter: ListCostRecordsFilter): Promise<AITokenCostRecord[]> {
      let query = client
        .from(COSTS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .order("recorded_at", { ascending: false });
      if (filter.billingPeriod) query = query.eq("billing_period", filter.billingPeriod);
      if (filter.providerKey) query = query.eq("provider_key", filter.providerKey);
      if (filter.limit) query = query.limit(filter.limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapCost(row as Record<string, unknown>));
    },
  };
}
