import { supabase } from "@/lib/supabase";
import type { TimelineActor, TimelineEvent, TimelineEventProvider, TimelineFetchInput } from "../types";
import { fetchActorNames } from "../provider-utils";

/**
 * Phase 1 provider — emits lifecycle events sourced from the customers table
 * plus append-only customer_lifecycle_events (status changes).
 */
export class CustomerLifecycleTimelineProvider implements TimelineEventProvider {
  readonly providerId = "customer-lifecycle";

  async getEvents({ customerId, companyId }: TimelineFetchInput): Promise<TimelineEvent[]> {
    if (!companyId) return [];

    const [{ data: customer, error: customerError }, { data: lifecycleRows, error: lifecycleError }] =
      await Promise.all([
        supabase
          .from("customers")
          .select("id, created_at, user_id, company_id")
          .eq("id", customerId)
          .eq("company_id", companyId)
          .maybeSingle(),
        supabase
          .from("customer_lifecycle_events")
          .select(
            "id, event_type, old_status, new_status, reason, changed_by, created_at, customer_id",
          )
          .eq("customer_id", customerId)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

    if (customerError || !customer) return [];

    const lifecycleActorIds = (lifecycleRows ?? [])
      .map((row) => (typeof row.changed_by === "string" ? row.changed_by : null))
      .filter((id): id is string => Boolean(id));
    const createdActorId = typeof customer.user_id === "string" ? customer.user_id : null;
    const actorIds = [...new Set([...lifecycleActorIds, ...(createdActorId ? [createdActorId] : [])])];
    const actorNames = await fetchActorNames(actorIds);

    const events: TimelineEvent[] = [];

    const createdLabel = createdActorId ? actorNames.get(createdActorId) ?? null : null;
    const createdActor: TimelineActor = {
      id: createdActorId,
      label: createdLabel,
      type: createdLabel ? "employee" : "system",
    };

    events.push({
      id: `${this.providerId}:created:${customer.id}`,
      type: "customer_created",
      occurredAt: customer.created_at,
      source: this.providerId,
      payload: { customerId: customer.id },
      actor: createdActor,
      metadata: {
        actor: createdLabel,
        actorId: createdActorId,
      },
    });

    if (!lifecycleError) {
      for (const row of lifecycleRows ?? []) {
        if (String(row.event_type ?? "") !== "status_changed") continue;
        const changedBy = typeof row.changed_by === "string" ? row.changed_by : null;
        const label = changedBy ? actorNames.get(changedBy) ?? null : null;
        const actor: TimelineActor = {
          id: changedBy,
          label,
          type: label ? "employee" : "system",
        };
        const reason = typeof row.reason === "string" && row.reason.trim() ? row.reason.trim() : null;
        events.push({
          id: `${this.providerId}:status:${row.id}`,
          type: "customer_status_changed",
          occurredAt: row.created_at,
          source: this.providerId,
          payload: {
            customerId: row.customer_id,
            oldStatus: row.old_status,
            newStatus: row.new_status,
            reason,
          },
          actor,
          metadata: {
            actor: label,
            actorId: changedBy,
            oldStatus: row.old_status,
            newStatus: row.new_status,
            reason,
            detail: reason,
          },
        });
      }
    }

    return events;
  }
}
