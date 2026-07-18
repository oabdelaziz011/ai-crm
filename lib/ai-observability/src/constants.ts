export const TRACE_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type TraceStatus = (typeof TRACE_STATUSES)[number];

export const SPAN_STATUSES = ["pending", "running", "completed", "failed", "skipped"] as const;
export type SpanStatus = (typeof SPAN_STATUSES)[number];

export const TRACE_STAGES = [
  "conversation",
  "intent",
  "tool_router",
  "prompt_build",
  "ai_execution",
  "provider",
  "response",
] as const;
export type TraceStage = (typeof TRACE_STAGES)[number];

export const AI_ERROR_CATALOG_CODES = [
  "timeout",
  "rate_limit",
  "authentication",
  "provider_unavailable",
  "invalid_configuration",
  "policy_violation",
  "unknown",
] as const;
export type AIErrorCatalogCode = (typeof AI_ERROR_CATALOG_CODES)[number];

export const AI_OBSERVABILITY_PERMISSIONS = {
  analyticsView: "ai.analytics.view",
  analyticsManage: "ai.analytics.manage",
  costsView: "ai.costs.view",
} as const;

export const AI_OBSERVABILITY_AUDIT_EVENTS = [
  "trace_started",
  "trace_completed",
  "trace_failed",
  "cost_recorded",
  "provider_switched",
  "policy_violated",
] as const;
export type AIObservabilityAuditEvent = (typeof AI_OBSERVABILITY_AUDIT_EVENTS)[number];

export const DEFAULT_CURRENCY = "USD";

export const DEFAULT_MODEL_PRICING = {
  promptPer1kTokens: 0.0015,
  completionPer1kTokens: 0.002,
  currency: DEFAULT_CURRENCY,
} as const;
