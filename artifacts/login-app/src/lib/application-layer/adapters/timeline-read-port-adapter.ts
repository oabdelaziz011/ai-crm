import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TimelineReadPort,
  TimelineReadModel,
  TimelineQueryOptions,
} from "@workspace/application-layer";
import { customerTimelineService } from "@/lib/customer-timeline";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function resolveTimelineOptions(options?: TimelineQueryOptions | number) {
  if (typeof options === "number") return { limit: options };
  return options ?? {};
}

function mapTimelineActivity(activity: {
  id: string;
  type: string;
  occurredAt: string;
  metadata?: Record<string, unknown> | null;
  actorName?: string | null;
}): TimelineReadModel {
  const detail = typeof activity.metadata?.detail === "string" ? activity.metadata.detail : "";
  return Object.freeze({
    id: activity.id,
    occurredAt: activity.occurredAt,
    title: activity.type,
    description: detail,
    actor: activity.actorName ?? "System",
    eventType: activity.type,
  });
}

export function createLoginAppTimelineReadPort(
  _client: SupabaseClient,
  ctx: LoginAppPortContext,
): TimelineReadPort {
  return {
    async listForEntity(tenantId, entityType, entityId, options) {
      if (tenantId !== ctx.companyId || entityType !== "customer" || !ctx.hasPermission("customers.view")) {
        return [];
      }

      const resolved = resolveTimelineOptions(options);
      const page = await customerTimelineService.buildTimeline({
        companyId: tenantId,
        customerId: entityId,
        limit: resolved.limit ?? 50,
        search: resolved.search,
        filter: {
          dateFrom: resolved.from ?? null,
          dateTo: resolved.to ?? null,
          eventTypes: resolved.eventTypes as never,
        },
        access: {
          userId: ctx.actorUserId,
          companyId: tenantId,
          isSuperAdmin: ctx.isSuperAdmin,
          hasPermission: ctx.hasPermission,
        },
      });

      let items = page.activities.map(mapTimelineActivity);
      if (resolved.search) {
        const q = resolved.search.toLowerCase();
        items = items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.actor.toLowerCase().includes(q),
        );
      }
      if (resolved.offset) items = items.slice(resolved.offset);
      return items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    },
  };
}
