import type {
  TimelineActivity,
  TimelineCursor,
  TimelineFetchInput,
  TimelineFilter,
  TimelineGroup,
  TimelineGroupMode,
  TimelinePage,
  TimelinePageRequest,
} from "@/lib/customer-timeline/types";
import type { TimelineAggregator } from "@/lib/customer-timeline/aggregators/timeline-aggregator";

const DEFAULT_LIMIT = 30;

function applyFilters(activities: TimelineActivity[], filter?: TimelineFilter): TimelineActivity[] {
  if (!filter) return activities;

  return activities.filter((activity) => {
    if (filter.dateFrom && activity.occurredAt < filter.dateFrom) return false;
    if (filter.dateTo && activity.occurredAt > filter.dateTo) return false;

    if (filter.categories?.length && activity.category) {
      if (!filter.categories.includes(activity.category)) return false;
    }

    if (filter.sources?.length) {
      if (!filter.sources.includes(activity.source as never)) return false;
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

export function searchActivities(activities: TimelineActivity[], query?: string): TimelineActivity[] {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return activities;

  return activities.filter((activity) => {
    const haystack = [
      activity.metadata?.searchText,
      activity.metadata?.detail,
      activity.metadata?.actor,
      activity.metadata?.bookingId,
      activity.metadata?.invoiceId,
      activity.metadata?.invoiceNumber,
      activity.type,
      JSON.stringify(activity.payload),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

function paginateByCursor(
  activities: TimelineActivity[],
  cursor: TimelineCursor | null | undefined,
  limit: number,
): { page: TimelineActivity[]; nextCursor: TimelineCursor | null } {
  let startIndex = 0;

  if (cursor) {
    startIndex = activities.findIndex(
      (activity) =>
        activity.occurredAt === cursor.occurredAt && activity.id === cursor.id,
    );
    startIndex = startIndex >= 0 ? startIndex + 1 : 0;
  }

  const page = activities.slice(startIndex, startIndex + limit);
  const last = page[page.length - 1];
  const nextCursor =
    startIndex + limit < activities.length && last
      ? { occurredAt: last.occurredAt, id: last.id }
      : null;

  return { page, nextCursor };
}

/** Pagination, cursor loading, filtering, and search — no aggregation. */
export class CustomerTimelineRepository {
  constructor(private readonly aggregator: TimelineAggregator) {}

  async fetchPage(request: TimelinePageRequest): Promise<TimelinePage> {
    const limit = request.limit ?? DEFAULT_LIMIT;
    const all = await this.aggregator.collect({
      customerId: request.customerId,
      companyId: request.companyId,
    });

    const filtered = applyFilters(all, request.filter);
    const searched = searchActivities(filtered, request.search);
    const { page, nextCursor } = paginateByCursor(searched, request.cursor, limit);

    return {
      activities: page,
      groups: [],
      nextCursor,
      total: searched.length,
      hasMore: Boolean(nextCursor),
    };
  }

  async fetchAll(request: TimelineFetchInput): Promise<TimelineActivity[]> {
    return this.aggregator.collect(request);
  }
}
