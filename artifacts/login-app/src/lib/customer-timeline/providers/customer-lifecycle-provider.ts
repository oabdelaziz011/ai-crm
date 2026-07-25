import { supabase } from "@/lib/supabase";
import type { TimelineEvent, TimelineEventProvider, TimelineFetchInput } from "../types";

/**
 * Phase 1 provider — emits lifecycle events sourced from the customers table.
 * Additional lifecycle events can be appended here or via dedicated providers.
 */
export class CustomerLifecycleTimelineProvider implements TimelineEventProvider {
  readonly providerId = "customer-lifecycle";

  async getEvents({ customerId }: TimelineFetchInput): Promise<TimelineEvent[]> {
    const { data, error } = await supabase
      .from("customers")
      .select("id, created_at")
      .eq("id", customerId)
      .maybeSingle();

    if (error || !data) return [];

    return [
      {
        id: `${this.providerId}:created:${data.id}`,
        type: "customer_created",
        occurredAt: data.created_at,
        source: this.providerId,
        payload: { customerId: data.id },
      },
    ];
  }
}
