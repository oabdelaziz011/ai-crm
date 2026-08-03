import type {
  HandoffAgentResolverPort,
  HandoffAuditPort,
  HandoffContextAssemblyPort,
  HandoffConversationPort,
  HandoffEventPublisherPort,
  HandoffNotificationPort,
} from "./handoff-platform-ports.js";
import type { HandoffDomainEvent } from "../events/handoff-event-factory.js";

export function createNoopHandoffEventPublisher(): HandoffEventPublisherPort {
  return { async publish(_event: HandoffDomainEvent) {} };
}

export function createNoopHandoffNotificationPort(): HandoffNotificationPort {
  return { async notify() {} };
}

export function createNoopHandoffAuditPort(): HandoffAuditPort {
  return { async write() {} };
}

export function createNoopHandoffConversationPort(): HandoffConversationPort {
  return {
    async assignConversation() {},
    async releaseConversation() {},
    async closeConversation() {},
    async updateMetadata() {},
    async getConversation() {
      return null;
    },
  };
}

export function createNoopHandoffContextAssemblyPort(): HandoffContextAssemblyPort {
  return {
    async buildContext() {
      return {
        summary: "",
        suggestedResolution: "",
        suggestedReply: "",
        payload: {},
        openTickets: [],
        appointments: [],
      };
    },
  };
}

export function createNoopHandoffAgentResolverPort(): HandoffAgentResolverPort {
  return {
    async resolveAgentLabel(userId) {
      return userId;
    },
    async loadAgentLabels(userIds) {
      return new Map(userIds.map((id) => [id, id]));
    },
  };
}

export function createSupabaseHandoffAuditPort(client: import("@supabase/supabase-js").SupabaseClient): HandoffAuditPort {
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
