/** Enterprise conversation lifecycle states — single source of truth. */
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
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/** Actions that may trigger lifecycle transitions. */
export const LIFECYCLE_ACTIONS = [
  "take_over",
  "assign",
  "reassign",
  "accept",
  "reject",
  "transfer",
  "bulk_assign",
  "auto_assign",
  "round_robin_assign",
  "skills_assign",
  "queue_assign",
  "close",
  "reply",
  "internal_note",
  "return_to_ai",
  "escalate",
  "return",
  "resolve",
  "reopen",
  "ai_own",
  "ai_release",
  "ai_request_human",
  "ai_resume",
  "ai_return",
  "ai_escalate",
  "customer_reply",
  "internal_resolved",
  "queue_enqueue",
  "escalation_accept",
  "escalation_cancel",
] as const;

export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export const OWNER_KINDS = [
  "ai_employee",
  "user",
  "team",
  "department",
  "queue",
  "unassigned",
] as const;

export type OwnerKind = (typeof OWNER_KINDS)[number];

export type ConversationOwner = {
  kind: OwnerKind;
  id: string | null;
  label: string;
};

export const ASSIGNMENT_METHODS = [
  "manual",
  "auto",
  "round_robin",
  "skills",
  "queue",
  "bulk",
  "transfer",
  "escalation",
] as const;

export type AssignmentMethod = (typeof ASSIGNMENT_METHODS)[number];

export type AssignmentTargetType = "user" | "team" | "department" | "queue" | "ai_employee";

export type AssignmentRecord = {
  id: string;
  conversationId: string;
  targetType: AssignmentTargetType;
  targetId: string;
  targetLabel: string;
  method: AssignmentMethod;
  assignedAt: string;
  assignedByUserId: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  previousAssignmentId: string | null;
};

export const ESCALATION_LEVELS = [
  "agent",
  "team_leader",
  "supervisor",
  "manager",
  "admin",
] as const;

export type EscalationLevel = (typeof ESCALATION_LEVELS)[number];

export const ESCALATION_STATUSES = [
  "created",
  "target_selected",
  "reason_provided",
  "priority_set",
  "waiting_acceptance",
  "accepted",
  "returned",
  "cancelled",
  "resolved",
] as const;

export type EscalationStatus = (typeof ESCALATION_STATUSES)[number];

export type EscalationRecord = {
  id: string;
  conversationId: string;
  level: number;
  targetLevel: EscalationLevel;
  targetOwnerKind: OwnerKind;
  targetOwnerId: string | null;
  reason: string;
  priority: string;
  notes: string;
  status: EscalationStatus;
  createdAt: string;
  createdByUserId: string | null;
  acceptedAt: string | null;
  returnedAt: string | null;
  cancelledAt: string | null;
  resolvedAt: string | null;
  snapshot: {
    lifecycleState: LifecycleState;
    owner: ConversationOwner;
    queueId: string | null;
  };
};

export const PRESENCE_STATES = [
  "online",
  "offline",
  "busy",
  "typing",
  "viewing_conversation",
  "away",
] as const;

export type PresenceState = (typeof PRESENCE_STATES)[number];

export type AgentPresence = {
  userId: string;
  state: PresenceState;
  viewingConversationId: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
};

export const TIMELINE_EVENT_TYPES = [
  "message",
  "assignment",
  "escalation",
  "internal_note",
  "status_change",
  "ownership_change",
  "ai_takeover",
  "human_takeover",
  "close",
  "reopen",
  "sla_breach",
  "tag_change",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export type TimelineEvent = {
  id: string;
  conversationId: string;
  type: TimelineEventType;
  timestamp: string;
  actorId: string | null;
  actorLabel: string | null;
  summary: string;
  payload: Record<string, unknown>;
};

export type ConversationHeader = {
  conversationId: string;
  customer: { id: string | null; name: string; phone: string | null; email: string | null };
  language: string;
  channel: string;
  channelLabel: string;
  priority: string;
  queueId: string | null;
  queueLabel: string | null;
  owner: ConversationOwner;
  assignedUser: { id: string; name: string } | null;
  assignedTeam: { id: string; name: string } | null;
  aiEmployee: { id: string; name: string } | null;
  lifecycleState: LifecycleState;
  backendState: string;
  sla: { dueAt: string | null; breached: boolean; label: string | null };
  tags: string[];
  conversationNumber: string;
  unreadCount: number;
};

/** Persisted overlay stored in conversation.metadata.lifecycle */
export type LifecycleMetadataOverlay = {
  state?: LifecycleState;
  owner?: ConversationOwner;
  queueId?: string | null;
  tags?: string[];
  pendingInternal?: boolean;
  reopenedAt?: string;
  assignmentHistory?: AssignmentRecord[];
  escalations?: EscalationRecord[];
  timelineEvents?: TimelineEvent[];
  slaDueAt?: string | null;
  migratedAt?: string;
  migrationVersion?: number;
};

export type LifecycleContext = {
  conversationId: string;
  backendState: string;
  assignedUserId: string | null;
  aiAssistantId: string;
  metadata: Record<string, unknown>;
  operationalAssignment?: {
    targetType: AssignmentTargetType;
    targetId: string;
    targetLabel: string;
  } | null;
  activeQueueId?: string | null;
  hasActiveEscalation?: boolean;
  lastParticipantType?: string | null;
};

export type LifecycleTransitionResult = {
  fromState: LifecycleState;
  toState: LifecycleState;
  action: LifecycleAction;
  allowed: boolean;
  reason?: string;
  timelineEvent?: Omit<TimelineEvent, "id">;
};

export type LifecycleRole = "admin" | "manager" | "supervisor" | "agent" | "ai_employee";

export type LifecyclePermissionContext = {
  role: LifecycleRole;
  userId: string;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  isAssignedAgent?: boolean;
  isAiParticipant?: boolean;
};
