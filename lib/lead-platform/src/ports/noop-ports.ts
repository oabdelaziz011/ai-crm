import type { LeadDomainEvent } from "../events/lead-event-factory.js";
import type {
  LeadAssigneeResolverPort,
  LeadAuditPort,
  LeadConversionPort,
  LeadEventPublisherPort,
  LeadNotificationPort,
} from "./lead-platform-ports.js";

export function createNoopLeadEventPublisher(): LeadEventPublisherPort {
  return { async publish(_event: LeadDomainEvent) {} };
}

export function createNoopLeadNotificationPort(): LeadNotificationPort {
  return { async notify() {} };
}

export function createNoopLeadAuditPort(): LeadAuditPort {
  return { async write() {} };
}

export function createNoopLeadConversionPort(): LeadConversionPort {
  return {
    async convertLead(input) {
      throw new Error(`Lead conversion port not configured for lead ${input.leadId}`);
    },
  };
}

export function createNoopLeadAssigneeResolverPort(): LeadAssigneeResolverPort {
  return {
    async resolveAssigneeLabel(userId) {
      return userId;
    },
    async loadAssigneeLabels(userIds) {
      return new Map(userIds.map((id) => [id, id]));
    },
    async listAssigneeCandidates() {
      return [];
    },
  };
}

export function createSupabaseLeadAuditPort(client: import("@supabase/supabase-js").SupabaseClient): LeadAuditPort {
  return {
    async write(input) {
      await client.from("audit_logs").insert({
        company_id: input.companyId,
        user_id: input.userId,
        action: input.action,
        entity: input.entity,
        entity_id: input.entityId,
        metadata: input.metadata,
      });
    },
  };
}
