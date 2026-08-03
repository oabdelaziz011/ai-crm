import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityReadPort, ActivityReadModel } from "@workspace/application-layer";
import { createLoginAppTimelineReadPort } from "./timeline-read-port-adapter.js";
import { mapActivityChannel } from "@workspace/application-layer";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

const COMMUNICATION_TYPES = ["whatsapp", "email", "sms", "call", "phone", "meeting", "note", "internal"];

export function createLoginAppActivityReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): ActivityReadPort {
  const timelineRead = createLoginAppTimelineReadPort(client, ctx);

  return {
    async listForCustomer(tenantId, customerId, limit = 25) {
      const timeline = await timelineRead.listForEntity(tenantId, "customer", customerId, { limit: limit * 2 });
      return timeline
        .filter((item) => COMMUNICATION_TYPES.some((type) => item.eventType.toLowerCase().includes(type)))
        .slice(0, limit)
        .map(
          (item): ActivityReadModel =>
            Object.freeze({
              id: item.id,
              channel: mapActivityChannel(item.eventType),
              subject: item.title,
              occurredAt: item.occurredAt,
              preview: item.description,
              actor: item.actor,
            }),
        );
    },
  };
}
