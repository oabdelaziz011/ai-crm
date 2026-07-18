import type { AIErrorCatalogCode, SpanStatus, TraceStage, TraceStatus } from "./constants.js";

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type TraceContext = {
  traceId: string;
  traceRecordId: string;
  correlationId: string;
  companyId: string;
  conversationId?: string | null;
};

export type AITraceRecord = {
  id: string;
  trace_id: string;
  correlation_id: string;
  company_id: string;
  conversation_id: string | null;
  status: TraceStatus;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  created_by: string | null;
};

export type AITraceSpanRecord = {
  id: string;
  company_id: string;
  trace_id: string;
  correlation_id: string;
  stage: TraceStage;
  status: SpanStatus;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
};

export type AIExecutionAnalyticsRecord = {
  id: string;
  company_id: string;
  trace_id: string | null;
  correlation_id: string;
  execution_id: string | null;
  conversation_id: string | null;
  provider_key: string;
  model: string;
  prompt_build_id: string | null;
  template_key: string | null;
  template_version_id: string | null;
  latency_ms: number;
  retry_count: number;
  used_fallback: boolean;
  had_timeout: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  currency: string;
  execution_status: string;
  recorded_at: string;
};

export type AITokenCostRecord = {
  id: string;
  company_id: string;
  trace_id: string | null;
  execution_id: string | null;
  billing_period: string;
  provider_key: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  currency: string;
  recorded_at: string;
};

export type NormalizedError = {
  code: AIErrorCatalogCode;
  message: string;
  source_code: string | null;
};

export type StartTraceInput = {
  companyId: string;
  conversationId?: string | null;
  correlationId?: string | null;
};

export type StartSpanInput = {
  companyId: string;
  traceId: string;
  correlationId: string;
  stage: TraceStage;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export type CompleteSpanInput = {
  spanId: string;
  metadata?: Record<string, unknown>;
};

export type FailSpanInput = {
  spanId: string;
  error: unknown;
  metadata?: Record<string, unknown>;
};

export type CompleteTraceInput = {
  traceId: string;
};

export type FailTraceInput = {
  traceId: string;
  error: unknown;
};

export type RecordExecutionAnalyticsInput = {
  companyId: string;
  traceContext: TraceContext;
  executionId?: string | null;
  conversationId?: string | null;
  providerKey: string;
  model: string;
  promptBuildId?: string | null;
  templateKey?: string | null;
  templateVersionId?: string | null;
  latencyMs: number;
  retryCount: number;
  usedFallback: boolean;
  hadTimeout: boolean;
  tokenUsage: TokenUsage;
  executionStatus: string;
  errorCode?: string | null;
};

export type RecordTokenCostInput = {
  companyId: string;
  traceId?: string | null;
  executionId?: string | null;
  providerKey: string;
  model: string;
  tokenUsage: TokenUsage;
  billingPeriod?: string;
  currency?: string;
};

export type ListTracesFilter = {
  companyId: string;
  conversationId?: string;
  correlationId?: string;
  status?: TraceStatus;
  limit?: number;
};

export type ListAnalyticsFilter = {
  companyId: string;
  correlationId?: string;
  providerKey?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export type ListCostRecordsFilter = {
  companyId: string;
  billingPeriod?: string;
  providerKey?: string;
  limit?: number;
};

export type AnalyticsAggregate = {
  totalExecutions: number;
  totalLatencyMs: number;
  averageLatencyMs: number;
  totalRetries: number;
  timeoutCount: number;
  fallbackCount: number;
  totalTokens: number;
  totalEstimatedCost: number;
  currency: string;
  byProvider: Record<
    string,
    {
      executions: number;
      totalTokens: number;
      totalCost: number;
      averageLatencyMs: number;
    }
  >;
  byStatus: Record<string, number>;
};

export type CompanyCostAggregate = {
  companyId: string;
  billingPeriod: string;
  totalTokens: number;
  totalCost: number;
  currency: string;
  recordCount: number;
  byProvider: Record<string, { totalTokens: number; totalCost: number; recordCount: number }>;
};

export type CreateTraceInput = {
  companyId: string;
  conversationId?: string | null;
  correlationId: string;
  traceId: string;
  createdBy?: string | null;
};

export type CreateSpanInput = {
  companyId: string;
  traceId: string;
  correlationId: string;
  stage: TraceStage;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateTraceInput = {
  traceId: string;
  status: TraceStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  completedAt?: string | null;
};

export type UpdateSpanInput = {
  spanId: string;
  status: SpanStatus;
  metadata?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  completedAt?: string | null;
};

export type CreateExecutionAnalyticsInput = {
  companyId: string;
  traceId: string | null;
  correlationId: string;
  executionId: string | null;
  conversationId: string | null;
  providerKey: string;
  model: string;
  promptBuildId: string | null;
  templateKey: string | null;
  templateVersionId: string | null;
  latencyMs: number;
  retryCount: number;
  usedFallback: boolean;
  hadTimeout: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  currency: string;
  executionStatus: string;
};

export type CreateTokenCostInput = {
  companyId: string;
  traceId: string | null;
  executionId: string | null;
  billingPeriod: string;
  providerKey: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  currency: string;
};
