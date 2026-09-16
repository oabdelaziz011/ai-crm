export const ASSIGNMENT_AUDIT_ACTIONS = ["assigned", "reassigned", "unassigned"] as const;
export type AssignmentAuditAction = (typeof ASSIGNMENT_AUDIT_ACTIONS)[number];

export const ASSIGNMENT_AUDIT_SOURCES = ["human", "handoff", "ai", "system"] as const;
export type AssignmentAuditSource = (typeof ASSIGNMENT_AUDIT_SOURCES)[number];

export const ASSIGNMENT_AUDIT_RESOURCE_TYPES = [
  "conversation",
  "email_conversation",
  "ticket",
  "lead",
  "task",
] as const;
export type AssignmentAuditResourceType = (typeof ASSIGNMENT_AUDIT_RESOURCE_TYPES)[number];

export type AssignmentAuditEvent = {
  id: string;
  companyId: string;
  actorUserId: string | null;
  resourceType: AssignmentAuditResourceType;
  resourceId: string;
  previousAssigneeUserId: string | null;
  newAssigneeUserId: string | null;
  action: AssignmentAuditAction;
  source: AssignmentAuditSource;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type RecordAssignmentChangeInput = {
  companyId: string;
  actorUserId: string | null;
  resourceType: AssignmentAuditResourceType;
  resourceId: string;
  previousAssigneeUserId: string | null | undefined;
  newAssigneeUserId: string | null | undefined;
  source: AssignmentAuditSource;
  metadata?: Record<string, unknown>;
};

export type GetAssignmentHistoryInput = {
  companyId: string;
  resourceType: AssignmentAuditResourceType;
  resourceId: string;
  limit?: number;
  offset?: number;
};

export type AssignmentAuditDataPort = {
  insertEvent(input: Omit<AssignmentAuditEvent, "id" | "createdAt">): Promise<AssignmentAuditEvent>;
  listEvents(input: GetAssignmentHistoryInput): Promise<AssignmentAuditEvent[]>;
  /** Test-only guard — production port must reject cross-company inserts. */
  assertCompanyScope?(companyId: string, actorUserId: string | null): Promise<void>;
};
