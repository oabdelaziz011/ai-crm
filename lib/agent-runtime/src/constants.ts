export const AGENT_TASK_STATUSES = [
  "pending",
  "planning",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "retrying",
  "verified",
] as const;

export type AgentTaskStatus = (typeof AGENT_TASK_STATUSES)[number];

export const AGENT_WORKFLOW_STATUSES = [
  "planning",
  "running",
  "paused",
  "waiting_user",
  "completed",
  "failed",
  "cancelled",
] as const;

export type AgentWorkflowStatus = (typeof AGENT_WORKFLOW_STATUSES)[number];

export const AGENT_EVENT_TYPES = [
  "PlanningStarted",
  "PlanningCompleted",
  "TaskStarted",
  "TaskCompleted",
  "TaskFailed",
  "VerificationPassed",
  "VerificationFailed",
  "WorkflowCompleted",
  "WorkflowPaused",
  "CheckpointSaved",
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_BACKOFF_MS = 1000;
