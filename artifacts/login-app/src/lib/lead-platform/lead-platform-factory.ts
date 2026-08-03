import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createLeadPlatformServices,
  createSupabaseLeadAuditPort,
  type LeadDomainEvent,
  type LeadEventPublisherPort,
  type LeadPlatformServices,
} from "@workspace/lead-platform";
import { createModulePublisher } from "@workspace/platform-events";
import { getLoginAppPlatformEventBus } from "@/lib/application-layer/platform-event-bus-factory.js";
import {
  createLeadNotificationBridge,
  createLoginAppLeadAssigneeResolverPort,
} from "./lead-platform-adapters.js";
import { createLoginAppLeadConversionPort } from "./lead-conversion-port-adapter.js";

export function createLeadEventBridge(): LeadEventPublisherPort {
  return {
    async publish(event: LeadDomainEvent): Promise<void> {
      const publisher = createModulePublisher(getLoginAppPlatformEventBus(), "leads");
      const ctx = {
        tenantId: event.companyId,
        correlationId: `${event.leadId}:${event.type}:${event.occurredAt}`,
        actorId: typeof event.payload.actorUserId === "string" ? event.payload.actorUserId : undefined,
        actorType: "user" as const,
        sourceModule: "leads",
        entityType: "lead",
        entityId: event.leadId,
      };

      if (event.type === "lead_created") {
        await publisher.publish(
          "LeadCreated",
          { leadId: event.leadId, title: String(event.payload.title ?? "Lead"), source: String(event.payload.source ?? "") },
          ctx,
        );
      } else if (event.type === "lead_converted") {
        await publisher.publish(
          "LeadConverted",
          { leadId: event.leadId, customerId: String(event.payload.customerId ?? "") },
          ctx,
        );
      } else if (event.type.startsWith("lead_")) {
        await publisher.publish(
          "LeadUpdated",
          { leadId: event.leadId, changedFields: [event.type], patch: event.payload as Record<string, unknown> },
          ctx,
        );
      }
    },
  };
}

export function createLoginAppLeadPlatformServices(client: SupabaseClient): LeadPlatformServices {
  return createLeadPlatformServices(client, {
    assignees: createLoginAppLeadAssigneeResolverPort(client),
    conversion: createLoginAppLeadConversionPort(client),
    events: createLeadEventBridge(),
    notifications: createLeadNotificationBridge(),
    audit: createSupabaseLeadAuditPort(client),
  });
}
