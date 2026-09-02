import type {
  TimelineAccessContext,
  TimelineCollectInput,
  TimelineEvent,
  TimelinePublisher,
} from "@workspace/activity-timeline";
import type { TimelineActivity, TimelineActivitySource } from "@/lib/customer-timeline/types";

type ExtendedTimelineAccessContext = TimelineAccessContext & {
  isModuleEnabled?: (featureCode: string) => boolean | undefined;
  entitlementResolved?: boolean;
  canAccessActivitySource?: (sourceId: string) => boolean;
};

function asExtendedAccess(ctx: TimelineAccessContext): ExtendedTimelineAccessContext {
  return ctx as ExtendedTimelineAccessContext;
}

function publisherAllowed(
  sourceId: string,
  access?: {
    isSuperAdmin?: boolean;
    hasPermission: (code: string) => boolean;
    canAccessActivitySource?: (sourceId: string) => boolean;
  },
): boolean {
  if (!access) return false;
  if (access.canAccessActivitySource) {
    return access.canAccessActivitySource(sourceId);
  }
  return access.isSuperAdmin || access.hasPermission("customers.view");
}

function mapActor(activity: TimelineActivity): TimelineEvent["actor"] {
  if (activity.actor) {
    return activity.actor;
  }

  return {
    id: typeof activity.metadata?.actorId === "string" ? activity.metadata.actorId : null,
    label: typeof activity.metadata?.actor === "string" ? activity.metadata.actor : null,
    type: "system",
  };
}

export function mapActivityToTimelineEvent(
  activity: TimelineActivity,
  scope: { entityType: string; entityId: string; companyId: string },
): TimelineEvent {
  const title =
    typeof activity.metadata?.title === "string"
      ? activity.metadata.title
      : String(activity.type).replace(/_/g, " ");

  return {
    id: activity.id,
    timestamp: activity.occurredAt,
    actor: mapActor(activity),
    eventType: activity.type,
    title,
    description:
      typeof activity.metadata?.detail === "string"
        ? activity.metadata.detail
        : null,
    metadata: {
      ...activity.metadata,
      payload: activity.payload,
      category: activity.category,
      visibility: activity.visibility,
      legacySource: activity.source,
    },
    sourceModule: String(activity.sourceModule ?? activity.source),
    entityType: scope.entityType,
    entityId: scope.entityId,
    companyId: scope.companyId,
  };
}

export function mapTimelineEventToActivity(event: TimelineEvent): TimelineActivity {
  const metadata = { ...event.metadata };
  const payload =
    metadata.payload && typeof metadata.payload === "object"
      ? (metadata.payload as Record<string, unknown>)
      : {};

  delete metadata.payload;

  return {
    id: event.id,
    type: event.eventType as TimelineActivity["type"],
    occurredAt: event.timestamp,
    source: event.sourceModule,
    sourceModule: event.sourceModule,
    category: typeof metadata.category === "string" ? (metadata.category as TimelineActivity["category"]) : undefined,
    payload,
    metadata: {
      ...metadata,
      title: event.title,
      detail: event.description,
      actor: event.actor.label,
      actorId: event.actor.id,
    },
    actor: event.actor,
    visibility:
      metadata.visibility === "public" ||
      metadata.visibility === "internal" ||
      metadata.visibility === "system"
        ? metadata.visibility
        : undefined,
  };
}

export function createLegacySourcePublisher(
  source: TimelineActivitySource,
  options?: {
    sourceModule?: string;
    requiredPermissions?: string[];
    supportedEventTypes?: string[];
  },
): TimelinePublisher {
  const sourceModule = options?.sourceModule ?? String(source.sourceId);

  return {
    moduleId: String(source.sourceId),
    sourceModule,
    entityTypes: ["customer", "account"],
    supportedEventTypes: options?.supportedEventTypes ?? ["system_event"],
    requiredPermissions: options?.requiredPermissions,
    collect: async (ctx, input: TimelineCollectInput) => {
      if (input.entityType !== "customer") {
        return [];
      }

      const sourceId = String(source.sourceId);
      const extended = asExtendedAccess(ctx);
      if (
        !publisherAllowed(sourceId, {
          isSuperAdmin: extended.isSuperAdmin,
          hasPermission: extended.hasPermission,
          canAccessActivitySource: extended.canAccessActivitySource,
        })
      ) {
        return [];
      }

      const activities = await source.collect({
        customerId: input.entityId,
        companyId: input.companyId,
        access: {
          userId: extended.userId,
          companyId: extended.companyId,
          isSuperAdmin: extended.isSuperAdmin,
          hasPermission: extended.hasPermission,
          isModuleEnabled: extended.isModuleEnabled,
          entitlementResolved: extended.entitlementResolved,
          canAccessActivitySource: extended.canAccessActivitySource,
        },
      });

      return activities.map((activity) =>
        mapActivityToTimelineEvent(activity, {
          entityType: input.entityType,
          entityId: input.entityId,
          companyId: input.companyId,
        }),
      );
    },
  };
}

export function applyLegacyActivityFilters(
  activities: TimelineActivity[],
  filter?: import("@/lib/customer-timeline/types").TimelineFilter,
): TimelineActivity[] {
  if (!filter) return activities;

  return activities.filter((activity) => {
    if (filter.categories?.length && activity.category) {
      if (!filter.categories.includes(activity.category)) return false;
    }

    if (filter.channels?.length) {
      const channel = activity.metadata?.channel;
      if (channel && !filter.channels.includes(channel)) return false;
    }

    if (filter.employeeId && activity.metadata?.employeeId !== filter.employeeId) return false;
    if (filter.automationOnly && activity.category !== "automation") return false;
    if (filter.bookingOnly && activity.category !== "booking") return false;
    if (filter.invoiceOnly && activity.category !== "billing") return false;
    if (filter.unreadOnly && !activity.metadata?.unread) return false;

    if (filter.legacyFilterId && filter.legacyFilterId !== "all") {
      const group = activity.metadata?.filterGroup ?? "";
      if (filter.legacyFilterId === "messages" && group !== "messages") return false;
      if (filter.legacyFilterId === "bookings" && group !== "bookings") return false;
      if (filter.legacyFilterId === "invoices" && group !== "invoices") return false;
      if (filter.legacyFilterId === "notes" && group !== "notes") return false;
      if (filter.legacyFilterId === "calls" && group !== "calls") return false;
      if (filter.legacyFilterId === "ai" && group !== "ai" && activity.category !== "automation") return false;
      if (filter.legacyFilterId === "notifications" && group !== "notifications") return false;
      if (filter.legacyFilterId === "automation" && activity.category !== "automation") return false;
      if (filter.legacyFilterId === "email" && activity.category !== "email") return false;
    }

    return true;
  });
}
