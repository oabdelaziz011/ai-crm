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
  }): Promise<{ customerId: string; opportunityId?: string | null; customerCreated?: boolean }>;
}

export type LeadOpportunityConversionContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

/**
 * Opportunity side of "Convert Lead → Customer + Opportunity".
 * Implementations must delegate to the Opportunity platform (createFromLead) — never
 * re-implement pipeline/stage/currency/owner defaults here.
 */
export interface LeadOpportunityConversionPort {
  /** Read-only lookup of an opportunity already created from this lead. */
  findOpportunityForLead(input: {
    companyId: string;
    leadId: string;
  }): Promise<{ opportunityId: string } | null>;
  /** Fail before any conversion write when an opportunity could not be created (e.g. no currency). */
  assertCanCreateForLead(
    ctx: LeadOpportunityConversionContext,
    input: { companyId: string; leadId: string; companyDefaultCurrency?: string },
  ): Promise<void>;
  /** Idempotent: reuses the lead's existing opportunity, otherwise creates one from the lead. */
  ensureOpportunityForLead(
    ctx: LeadOpportunityConversionContext,
    input: { companyId: string; leadId: string; companyDefaultCurrency?: string },
  ): Promise<{ opportunityId: string; created: boolean }>;
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

/**
 * Optional Opportunity stage sync after an authoritative Lead stage change.
 * Implementations must use OpportunityCommandService (no client-only updates, no provider sends).
 */
export interface LeadOpportunityStageSyncPort {
  onLeadLifecycleChanged(input: {
    companyId: string;
    leadId: string;
    fromLifecycleStatus: string;
    toLifecycleStatus: string;
    actorUserId: string | null;
  }): Promise<{
    status: string;
    reason: string;
    opportunityId?: string | null;
  }>;
}
