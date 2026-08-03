export const HANDOFF_PERMISSIONS = {
  view: "handoff.view",
  transfer: "handoff.transfer",
  accept: "handoff.accept",
  reject: "handoff.reject",
  assign: "handoff.assign",
  queue: "handoff.queue",
  escalate: "handoff.escalate",
  returnToAi: "handoff.return_to_ai",
  presence: "handoff.presence",
  manage: "handoff.manage",
} as const;

export const OWNER_TYPES = ["ai_employee", "human_agent", "queue", "system"] as const;

export const ROUTING_STRATEGIES = [
  "round_robin",
  "least_busy",
  "skills_based",
  "department_based",
  "priority_based",
  "vip_routing",
  "language_routing",
] as const;

export const PRESENCE_STATES = ["online", "busy", "away", "offline", "break", "dnd"] as const;

export const ESCALATION_TRIGGERS = [
  "low_confidence",
  "customer_requested",
  "sensitive_topic",
  "billing",
  "complaint",
  "repeated_failures",
  "policy_violation",
  "manual",
] as const;

export const HANDOFF_REQUEST_TYPES = ["transfer", "escalation", "queue", "return_to_ai"] as const;

export const HANDOFF_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
] as const;

export const LIFECYCLE_STATES = [
  "NEW",
  "AI_HANDLING",
  "WAITING_QUEUE",
  "ASSIGNED",
  "PENDING_CUSTOMER",
  "PENDING_INTERNAL",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "PAUSED",
] as const;

export const HANDOFF_DOMAIN_EVENTS = [
  "conversation_transferred",
  "conversation_accepted",
  "conversation_rejected",
  "conversation_escalated",
  "conversation_returned_to_ai",
  "queue_joined",
  "queue_left",
  "owner_changed",
  "conversation_paused",
  "conversation_resumed",
  "conversation_closed",
] as const;

export const HANDOFF_WORKFLOW_EVENTS: Record<(typeof HANDOFF_DOMAIN_EVENTS)[number], string> = {
  conversation_transferred: "conversation.transferred",
  conversation_accepted: "conversation.accepted",
  conversation_rejected: "conversation.rejected",
  conversation_escalated: "conversation.escalated",
  conversation_returned_to_ai: "conversation.returned_to_ai",
  queue_joined: "conversation.queue_joined",
  queue_left: "conversation.queue_left",
  owner_changed: "conversation.owner_changed",
  conversation_paused: "conversation.paused",
  conversation_resumed: "conversation.resumed",
  conversation_closed: "conversation.closed",
};

export const HANDOFF_QUERY_CACHE_TTL = {
  metrics: 5 * 60 * 1000,
  workspace: 30 * 1000,
  queuePosition: 15 * 1000,
  ownership: 30 * 1000,
  presence: 15 * 1000,
} as const;

export const DEFAULT_PRESENCE_HEARTBEAT_MS = 30_000;
export const DEFAULT_PRESENCE_TIMEOUT_MS = 120_000;
export const DEFAULT_HANDOFF_REQUEST_TTL_MS = 15 * 60 * 1000;
