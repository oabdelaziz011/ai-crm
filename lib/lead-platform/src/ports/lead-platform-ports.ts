import type { LeadDomainEvent } from "../events/lead-event-factory.js";

export interface LeadEventPublisherPort {
  publish(event: LeadDomainEvent): Promise<void>;
}

export interface LeadNotificationPort {
  notify(input: {
    kind: "assignment" | "conversion" | "qualification" | "stage_change";
    companyId: string;
    leadId: string;
    actorUserId: string | null;
    recipientUserId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export type LeadAuditInput = {
  companyId: string;
  userId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  entity: string;
  entityId: string;
  metadata: Record<string, unknown>;
};

export interface LeadAuditPort {
  write(input: LeadAuditInput): Promise<void>;
}

/** Creates customer on lead conversion — no duplicated CRM logic. */
export interface LeadConversionPort {
  convertLead(input: {
    companyId: string;
    leadId: string;
    contactName: string;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    actorUserId: string | null;
    preservedPayload: Record<string, unknown>;
  }): Promise<{ customerId: string; opportunityId?: string | null }>;
}

export interface LeadAssigneeResolverPort {
  resolveAssigneeLabel(userId: string): Promise<string>;
  loadAssigneeLabels(userIds: string[]): Promise<Map<string, string>>;
  listAssigneeCandidates(input: {
    companyId: string;
    territory?: string | null;
    department?: string | null;
    language?: string | null;
  }): Promise<Array<{ userId: string; activeLeadCount: number; lastAssignedAt: string | null }>>;
}
