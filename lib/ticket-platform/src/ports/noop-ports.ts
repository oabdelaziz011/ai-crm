import type { TicketDomainEvent } from "../events/ticket-event-factory.js";
import type {
  TicketAuditPort,
  TicketEventPublisherPort,
  TicketNotificationInput,
  TicketNotificationPort,
  TicketSlaSettingsPort,
} from "./ticket-platform-ports.js";

export function createNoopTicketEventPublisher(): TicketEventPublisherPort {
  return {
    async publish(_event: TicketDomainEvent): Promise<void> {
      /* wired in application layer */
    },
  };
}

export function createNoopTicketNotificationPort(): TicketNotificationPort {
  return {
    async notify(_input: TicketNotificationInput): Promise<void> {
      /* wired in application layer */
    },
  };
}

export function createNoopTicketAuditPort(): TicketAuditPort {
  return {
    async write(): Promise<void> {
      /* optional — DB triggers also write audit_logs */
    },
  };
}

export function createNoopTicketSlaSettingsPort(): TicketSlaSettingsPort {
  return {
    async getByCompanyId() {
      return null;
    },
  };
}

export function createSupabaseTicketAuditPort(
  client: import("@supabase/supabase-js").SupabaseClient,
): TicketAuditPort {
  return {
    async write(input) {
      const { error } = await client.from("audit_logs").insert({
        company_id: input.companyId,
        user_id: input.userId,
        action: input.action,
        entity: input.entity,
        entity_id: input.entityId,
        metadata: input.metadata,
      });
      if (error) {
        console.warn("[ticket-platform] audit log write failed:", error.message);
      }
    },
  };
}
