import { supabase } from "@/lib/supabase";
import type { TimelineActor, TimelineEvent, TimelineEventProvider, TimelineFetchInput } from "../types";
import { fetchActorNames } from "../provider-utils";

/**
 * Phase 1 provider — emits lifecycle events sourced from the customers table.
 * Additional lifecycle events can be appended here or via dedicated providers.
 */
export class CustomerLifecycleTimelineProvider implements TimelineEventProvider {
  readonly providerId = "customer-lifecycle";

  async getEvents({ customerId }: TimelineFetchInput): Promise<TimelineEvent[]> {
    const { data, error } = await supabase
      .from("customers")
      .select("id, created_at, user_id")
      .eq("id", customerId)
      .maybeSingle();

    if (error || !data) return [];

    const actorId = typeof data.user_id === "string" ? data.user_id : null;
    const actorNames = await fetchActorNames(actorId ? [actorId] : []);
    const label = actorId ? actorNames.get(actorId) ?? null : null;
    const actor: TimelineActor = {
      id: actorId,
      label,
      type: label ? "employee" : "system",
    };

    return [
      {
        id: `${this.providerId}:created:${data.id}`,
        type: "customer_created",
        occurredAt: data.created_at,
        source: this.providerId,
        payload: { customerId: data.id },
        actor,
        metadata: {
          actor: label,
          actorId,
        },
      },
    ];
  }
}
