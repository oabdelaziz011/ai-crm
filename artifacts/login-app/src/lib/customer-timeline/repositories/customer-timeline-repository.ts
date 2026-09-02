import {
  ActivityQueryFailedError,
  CustomerNotFoundInTenantError,
  TimelineEntityAccessError,
  TimelineError,
  TimelineTenantIsolationError,
  type TimelineEngine,
  type TimelineEntityAccessPort,
} from "@workspace/activity-timeline";
import type { TimelineAggregator } from "@/lib/customer-timeline/aggregators/timeline-aggregator";
import type {
  TimelineActivity,
  TimelineCursor,
  TimelineFetchInput,
  TimelineFilter,
  TimelinePage,
  TimelinePageRequest,
} from "@/lib/customer-timeline/types";
import {
  createLegacyEventPredicate,
  requireTimelineAccess,
  toTimelineAccessContext,
} from "@/lib/customer-timeline/adapters/timeline-access";
import { mapTimelineEventToActivity } from "@/lib/customer-timeline/adapters/activity-timeline-bridge";
import { createCustomerTimelineEngine } from "@/lib/customer-timeline/adapters/customer-timeline-engine";

const DEFAULT_LIMIT = 30;
const MAX_LIST_LIMIT = 10_000;

function mapFilterToEngine(filter?: TimelineFilter, search?: string) {
  return {
    dateFrom: filter?.dateFrom ?? undefined,
    dateTo: filter?.dateTo ?? undefined,
    eventTypes: filter?.eventTypes,
    sourceModules: filter?.sourceModules ?? filter?.sources,
    search: search ?? undefined,
  };
}

function mapCursor(cursor?: TimelineCursor | null) {
  if (!cursor) return null;
  return {
    timestamp: cursor.occurredAt,
    id: cursor.id,
    sourceModule: String(cursor.sourceModule ?? cursor.source ?? "unknown"),
  };
}

function mapEngineCursor(
  cursor: { timestamp: string; id: string; sourceModule: string } | null,
): TimelineCursor | null {
  if (!cursor) return null;
  return {
    occurredAt: cursor.timestamp,
    id: cursor.id,
    sourceModule: cursor.sourceModule,
  };
}

function rethrowActivityError(error: unknown): never {
  if (
    error instanceof CustomerNotFoundInTenantError ||
    error instanceof TimelineTenantIsolationError ||
    error instanceof TimelineEntityAccessError ||
    (error instanceof TimelineError && error.code === "CUSTOMER_NOT_FOUND_IN_TENANT")
  ) {
    throw error;
  }
  throw new ActivityQueryFailedError(
    error instanceof Error ? error.message : "Activity query failed.",
  );
}

/** Secured pagination — all queries require RBAC, tenant, and entity ownership. */
export class CustomerTimelineRepository {
  private engine?: TimelineEngine;

  constructor(
    private readonly aggregator: TimelineAggregator,
    private readonly entityAccess: TimelineEntityAccessPort,
  ) {}

  private getEngine(): TimelineEngine {
    if (!this.engine) {
      this.engine = createCustomerTimelineEngine(this.aggregator, this.entityAccess);
    }
    return this.engine;
  }

  async fetchPage(request: TimelinePageRequest): Promise<TimelinePage> {
    try {
      const access = requireTimelineAccess(request);
      const companyId = request.companyId ?? access.companyId;
      const limit = request.limit ?? DEFAULT_LIMIT;

      const page = await this.getEngine().query(toTimelineAccessContext(access), {
        entityType: "customer",
        entityId: request.customerId,
        companyId,
        cursor: mapCursor(request.cursor),
        limit,
        sort: request.sort ?? "newest",
        filter: mapFilterToEngine(request.filter, request.search),
        additionalFilter: createLegacyEventPredicate(request.filter),
      });

      return {
        activities: page.events.map(mapTimelineEventToActivity),
        groups: [],
        nextCursor: mapEngineCursor(page.nextCursor),
        total: page.total,
        hasMore: page.hasMore,
      };
    } catch (error) {
      rethrowActivityError(error);
    }
  }

  async fetchAll(request: TimelineFetchInput): Promise<TimelineActivity[]> {
    const page = await this.fetchPage({
      ...request,
      limit: MAX_LIST_LIMIT,
      cursor: null,
    });
    return page.activities;
  }
}
