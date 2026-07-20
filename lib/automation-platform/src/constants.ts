export const AUTOMATION_FLOW_STATUSES = ["draft", "active", "disabled", "archived"] as const;
export type AutomationFlowStatus = (typeof AUTOMATION_FLOW_STATUSES)[number];

export const AUTOMATION_TRIGGER_TYPES = [
  "manual",
  "webhook",
  "inbound_message",
  "schedule",
  "api_event",
] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

export const AUTOMATION_NODE_TYPES = ["trigger", "action", "condition", "delay", "end"] as const;
export type AutomationNodeType = (typeof AUTOMATION_NODE_TYPES)[number];

export const AUTOMATION_RUN_STATUSES = [
  "pending",
  "queued",
  "running",
  "waiting_input",
  "completed",
  "failed",
  "cancelled",
] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export const EXECUTION_LIFECYCLE_STATUSES = [
  "pending",
  "running",
  "waiting_input",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ExecutionLifecycleStatus = (typeof EXECUTION_LIFECYCLE_STATUSES)[number];

export const AUTOMATION_SESSION_STATUSES = [
  "active",
  "running",
  "waiting_input",
  "paused",
  "completed",
  "expired",
  "cancelled",
] as const;
export type AutomationSessionStatus = (typeof AUTOMATION_SESSION_STATUSES)[number];

export const AUTOMATION_CHANNELS = [
  "web_chat",
  "whatsapp",
  "email",
  "api",
  "messenger",
  "telegram",
  "instagram",
  "voice",
] as const;
export type AutomationChannel = (typeof AUTOMATION_CHANNELS)[number];

export const AUTOMATION_SENDER_TYPES = ["user", "system", "automation", "agent"] as const;
export type AutomationSenderType = (typeof AUTOMATION_SENDER_TYPES)[number];

export const AUTOMATION_MESSAGE_TYPES = ["text", "event", "command", "payload"] as const;
export type AutomationMessageType = (typeof AUTOMATION_MESSAGE_TYPES)[number];

export const AUTOMATION_PERMISSIONS = {
  view: "automation.view",
  create: "automation.create",
  edit: "automation.edit",
  delete: "automation.delete",
  publish: "automation.publish",
  execute: "automation.execute",
  rollback: "automation.rollback",
  archive: "automation.archive",
} as const;

export const AUTOMATION_AUDIT_EVENTS = [
  "flow_created",
  "flow_updated",
  "flow_published",
  "flow_disabled",
  "flow_archived",
  "flow_rolled_back",
  "flow_deleted",
  "run_started",
  "run_completed",
  "run_failed",
  "run_cancelled",
  "run_waiting_input",
] as const;
export type AutomationAuditEvent = (typeof AUTOMATION_AUDIT_EVENTS)[number];

export const AUTOMATION_SESSION_MESSAGES_TABLE = "automation_session_messages";

export const ORCHESTRATOR_TRIGGER_TYPES = [
  "new_conversation",
  "incoming_message",
  "manual_start",
  "api_trigger",
] as const;
export type OrchestratorTriggerType = (typeof ORCHESTRATOR_TRIGGER_TYPES)[number];

export const ACTIVE_SESSION_STATUSES = ["active", "running", "waiting_input", "paused"] as const;
export type ActiveSessionStatus = (typeof ACTIVE_SESSION_STATUSES)[number];

export const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export const ORCHESTRATOR_AUDIT_EVENTS = [
  "conversation_started",
  "conversation_resumed",
  "conversation_expired",
  "inbound_message_received",
] as const;
export type OrchestratorAuditEvent = (typeof ORCHESTRATOR_AUDIT_EVENTS)[number];
