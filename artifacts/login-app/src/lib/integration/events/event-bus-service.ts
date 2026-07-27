import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSourcePlatform, WebhookEventType } from "@/lib/integration/types";
import { EVENT_SOURCE_MAP, isRegisteredEventType } from "@/lib/integration/events/event-registry";
import { WebhookDeliveryService } from "@/lib/integration/webhooks/webhook-delivery-service";

/** Central event bus — all platforms publish here; webhooks subscribe. */
export class EventBusService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly delivery: WebhookDeliveryService,
  ) {}

  async publish(input: {
    companyId: string;
    eventType: WebhookEventType;
    eventId: string;
    payload: Record<string, unknown>;
    sourcePlatform?: EventSourcePlatform;
  }): Promise<void> {
    if (!isRegisteredEventType(input.eventType)) {
      throw new Error(`Unregistered event type: ${input.eventType}`);
    }

    const source = input.sourcePlatform ?? EVENT_SOURCE_MAP[input.eventType];

    await this.client.from("integration_event_log").upsert(
      {
        company_id: input.companyId,
        event_type: input.eventType,
        event_id: input.eventId,
        source_platform: source,
        payload: input.payload,
      },
      { onConflict: "company_id,event_type,event_id", ignoreDuplicates: true },
    );

    await this.delivery.enqueueForEvent(input.companyId, input.eventType, input.eventId, input.payload);
  }

  async listRecent(companyId: string, limit = 50) {
    const { data, error } = await this.client
      .from("integration_event_log")
      .select("*")
      .eq("company_id", companyId)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      eventType: row.event_type as WebhookEventType,
      eventId: String(row.event_id),
      sourcePlatform: String(row.source_platform),
      payload: (row.payload as Record<string, unknown>) ?? {},
      publishedAt: String(row.published_at),
    }));
  }
}
