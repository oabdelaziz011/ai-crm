export const AI_EXECUTION_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "timeout",
  "cancelled",
  "fallback",
] as const;

export type AIExecutionStatus = (typeof AI_EXECUTION_STATUSES)[number];

export const RESPONSE_FORMATS = ["text", "json"] as const;

export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

export const AI_EXECUTION_PERMISSIONS = {
  view: "ai.execution.view",
  manage: "ai.execution.manage",
} as const;

export const AI_EXECUTION_AUDIT_EVENTS = [
  "ai_execution_started",
  "ai_execution_completed",
  "ai_execution_failed",
  "provider_timeout",
  "provider_retry",
  "fallback_provider_used",
] as const;

export type AIExecutionAuditEvent = (typeof AI_EXECUTION_AUDIT_EVENTS)[number];

export const DEFAULT_EXECUTION_POLICY = {
  temperature: 0.7,
  top_p: 1,
  presence_penalty: 0,
  frequency_penalty: 0,
  max_tokens: 1024,
  response_format: "json" as const,
  streaming: false,
  timeout_ms: 30000,
  retry_count: 2,
  retry_delay_ms: 500,
  fallback_connection_id: null as string | null,
};
