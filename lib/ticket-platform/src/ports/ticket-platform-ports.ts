import type { TicketDomainEvent } from "../events/ticket-event-factory.js";

export interface TicketEventPublisherPort {
  publish(event: TicketDomainEvent): Promise<void>;
}

export type TicketNotificationKind =
  | "assignment"
  | "comment"
  | "status_change"
  | "priority_change"
  | "close"
  | "sla_warning"
  | "sla_breach";

export type TicketNotificationInput = {
  kind: TicketNotificationKind;
  companyId: string;
  ticketId: string;
  ticketNumber: string;
  subject: string;
  actorUserId: string | null;
  recipientUserId?: string | null;
  customerId?: string | null;
  conversationId?: string | null;
  metadata?: Record<string, unknown>;
};

export interface TicketNotificationPort {
  notify(input: TicketNotificationInput): Promise<void>;
}

export type TicketAuditInput = {
  companyId: string;
  userId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  entity: string;
  entityId: string;
  metadata: Record<string, unknown>;
};

export interface TicketAuditPort {
  write(input: TicketAuditInput): Promise<void>;
}

export interface TicketAssigneeResolverPort {
  resolveAssigneeUserId(input: {
    companyId: string;
    assigneeUserId?: string;
    assigneeName?: string;
  }): Promise<string>;
  loadAssigneeNames(userIds: string[]): Promise<Map<string, string>>;
  findAssigneeCandidates(companyId: string, assigneeName: string): Promise<string[]>;
}

export type TicketSlaSettingsRecord = {
  companyId: string;
  urgentHours: number;
  highHours: number;
  normalHours: number;
  lowHours: number;
  warningHours: number;
};

/** Loads per-company SLA hours; return null to use platform defaults. */
export interface TicketSlaSettingsPort {
  getByCompanyId(companyId: string): Promise<TicketSlaSettingsRecord | null>;
}
