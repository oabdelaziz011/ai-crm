export const RUNTIME_EXECUTION_STATUSES = ["queued", "running", "completed", "failed"] as const;
export type RuntimeExecutionStatus = (typeof RUNTIME_EXECUTION_STATUSES)[number];

export const RUNTIME_SESSION_STATUSES = ["active", "completed", "failed", "cancelled"] as const;
export type RuntimeSessionStatus = (typeof RUNTIME_SESSION_STATUSES)[number];

export const RUNTIME_STEP_STATUSES = ["running", "completed", "failed", "skipped"] as const;
export type RuntimeStepStatus = (typeof RUNTIME_STEP_STATUSES)[number];

export const RUNTIME_PIPELINE_STAGES = [
  "conversation",
  "state",
  "intent",
  "retrieval",
  "prompt",
  "execution",
  "provider",
  "response",
  "persistence",
  "observability",
] as const;

export type RuntimePipelineStage = (typeof RUNTIME_PIPELINE_STAGES)[number];

export const RUNTIME_PERMISSIONS = {
  view: "runtime.view",
  execute: "runtime.execute",
  manage: "runtime.manage",
} as const;

export const RUNTIME_AUDIT_EVENTS = [
  "runtime_started",
  "runtime_completed",
  "runtime_failed",
  "runtime_step_completed",
  "runtime_policy_updated",
] as const;

export type RuntimeAuditEvent = (typeof RUNTIME_AUDIT_EVENTS)[number];

export const DEFAULT_MAX_PIPELINE_DURATION_MS = 120_000;
