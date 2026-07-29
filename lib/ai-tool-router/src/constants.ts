export const BUILTIN_TOOL_KEYS = [
  "knowledge_lookup",
  "crm_lookup",
  "customer_profile",
  "create_customer",
  "faq",
  "notification",
  "escalation",
] as const;

export type BuiltinToolKey = (typeof BUILTIN_TOOL_KEYS)[number];

export const TOOL_EXECUTION_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "denied",
  "timeout",
] as const;

export type ToolExecutionStatus = (typeof TOOL_EXECUTION_STATUSES)[number];

export const TOOL_TRIGGER_SOURCES = ["router", "agent", "automation", "llm"] as const;

export type ToolTriggerSource = (typeof TOOL_TRIGGER_SOURCES)[number];

export const TOOL_PERMISSIONS = {
  view: "tools.view",
  execute: "tools.execute",
  manage: "tools.manage",
} as const;

export const TOOL_AUDIT_EVENTS = [
  "tool_executed",
  "tool_failed",
  "tool_timeout",
  "tool_disabled",
  "tool_enabled",
] as const;

export type ToolAuditEvent = (typeof TOOL_AUDIT_EVENTS)[number];
